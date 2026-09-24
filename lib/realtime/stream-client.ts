import { parseStreamPayload, type StreamPayload, type StreamStatus } from "@/lib/realtime/stream-payload";

export const BASE_RETRY_MS = 1000;
export const MAX_RETRY_MS = 30000;

export type StreamSource = {
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void;
  close(): void;
};

export type StreamDeps = {
  createSource: (url: string) => StreamSource;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

/**
 * One EventSource per screen, with its own exponential-backoff reconnect: the
 * browser's native auto-reconnect retries at a fixed interval and cannot be
 * backed off, so this manages the connection manually (closing it before
 * scheduling a retry stops the native reconnect from also firing).
 *
 * Three ways a connection ends, and what each does:
 *
 *  - The server's scheduled handoff (`reconnect`, every 75 s so no proxy sees
 *    an endless stream). Make before break: the replacement is opened first
 *    and the old stream closed only once it is open, and the server keeps the
 *    old one delivering for a few seconds after saying so. Closing first would
 *    leave a gap in which an order placed is announced to nobody, which a load
 *    test caught: five screens missed the same three orders. Nothing refreshes
 *    here, because nothing was missed.
 *  - A drop (`error`). Backs off and reconnects; on reopening the screen is told
 *    to reconcile, since nothing on the server replays what it missed.
 *  - The caller's own stop.
 *
 * A pure function over injected browser APIs, so its rules are tested without
 * a browser.
 */
export function connectStream(
  url: string,
  handlers: { onUpdate: (payload: StreamPayload | null) => void; onStatus: (status: StreamStatus) => void },
  deps: StreamDeps
): () => void {
  let current: StreamSource | null = null;
  let retryTimer: unknown = null;
  let retryDelay = BASE_RETRY_MS;
  let hasBeenOpen = false;
  let stopped = false;

  function wire(source: StreamSource, kind: "first" | "replacement") {
    let opened = false;
    source.addEventListener("open", () => {
      if (stopped || (kind === "first" && current !== source)) return;
      opened = true;
      retryDelay = BASE_RETRY_MS;
      if (kind === "replacement") {
        const old = current;
        current = source;
        old?.close();
        return;
      }
      handlers.onStatus("open");
      // A screen that was open before and is opening again lost its stream to a
      // drop (a planned handoff never comes through here), so it may be stale.
      if (hasBeenOpen) handlers.onUpdate({ reconcile: true });
      hasBeenOpen = true;
    });
    source.addEventListener("update", (event) => {
      if (stopped) return;
      handlers.onUpdate(parseStreamPayload(event.data));
    });
    source.addEventListener("reconnect", () => {
      if (stopped || current !== source) return;
      const replacement = deps.createSource(url);
      wire(replacement, "replacement");
    });
    source.addEventListener("error", () => {
      if (stopped) return;
      // A replacement that fails before it opens leaves the old stream alone:
      // it is still delivering, and the server will end it on its own.
      if (kind === "replacement" && !opened) {
        source.close();
        return;
      }
      if (current !== source) return;
      source.close();
      current = null;
      handlers.onStatus("offline");
      retryTimer = deps.setTimeout(connect, retryDelay);
      retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
    });
  }

  function connect() {
    if (stopped) return;
    handlers.onStatus("connecting");
    const source = deps.createSource(url);
    current = source;
    wire(source, "first");
  }

  connect();

  return () => {
    stopped = true;
    current?.close();
    if (retryTimer !== null) deps.clearTimeout(retryTimer);
  };
}
