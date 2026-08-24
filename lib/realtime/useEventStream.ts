"use client";

import { useEffect, useRef, useState } from "react";

export type StreamStatus = "connecting" | "open" | "offline";

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

    function connect() {
      if (stopped) return;
      setStatus("connecting");
      source = new EventSource(url);

      source.addEventListener("open", () => {
        retryDelay = BASE_RETRY_MS;
        setStatus("open");
      });

      source.addEventListener("update", () => {
        onUpdateRef.current();
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
