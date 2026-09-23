"use client";

import { useEffect, useRef, useState } from "react";

export type StreamStatus = "connecting" | "open" | "offline";

/** Whether an `open` should refresh: only when it follows a connection that dropped, not the first open and not the planned handoff. */
export function shouldRefreshOnOpen(state: { hasBeenOpen: boolean; plannedHandoff: boolean }): boolean {
  return state.hasBeenOpen && !state.plannedHandoff;
}

const BASE_RETRY_MS = 1000;
const MAX_RETRY_MS = 30000;

/**
 * One EventSource per mount, with its own exponential-backoff reconnect —
 * the browser's native auto-reconnect exists but retries at a fixed
 * interval and can't be backed off, so this manages the connection
 * manually (closing it before scheduling a retry stops the native
 * reconnect from also firing). Every `update` event just calls onUpdate();
 * it carries no payload the caller should trust — the actual data always
 * comes back through the normal, already-authorized page render.
 *
 * Every reconnect after the first that was not the server's own scheduled
 * handoff also calls onUpdate(). A stream that dropped (a server restart, a
 * network cut) can have missed changes, and nothing on the server replays them
 * to one client; a refresh on reconnect is what makes "offline for a minute"
 * not mean "stale until the next change". The handoff is excluded because it
 * happens every 75 s on a healthy connection and reconnects in milliseconds:
 * refreshing on it would cost every open screen a full page render each time,
 * which is exactly the load this stream exists to remove.
 */
export function useEventStream(url: string, onUpdate: () => void): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = BASE_RETRY_MS;
    let stopped = false;
    let hasBeenOpen = false;
    let plannedHandoff = false;

    function connect() {
      if (stopped) return;
      setStatus("connecting");
      source = new EventSource(url);

      source.addEventListener("open", () => {
        retryDelay = BASE_RETRY_MS;
        setStatus("open");
        if (shouldRefreshOnOpen({ hasBeenOpen, plannedHandoff })) onUpdateRef.current();
        hasBeenOpen = true;
        plannedHandoff = false;
      });

      source.addEventListener("update", () => {
        onUpdateRef.current();
      });

      // The server's scheduled lifetime handoff (see MAX_LIFETIME_MS in the
      // route) — a planned close, not a failure. Closing it ourselves here
      // means the browser never sees an "error" (that only fires when the
      // connection drops out from under EventSource, not when this code
      // calls .close() on it), so the status never flickers to "offline"
      // for a healthy reconnect. Resets the backoff too, since this isn't
      // the failure the backoff exists to slow down.
      source.addEventListener("reconnect", () => {
        plannedHandoff = true;
        source?.close();
        retryDelay = BASE_RETRY_MS;
        connect();
      });

      source.addEventListener("error", () => {
        source?.close();
        setStatus("offline");
        if (stopped) return;
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
      });
    }

    connect();

    return () => {
      stopped = true;
      source?.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [url]);

  return status;
}
