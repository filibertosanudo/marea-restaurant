"use client";

import { useEffect, useRef, useState } from "react";
import { connectStream, type StreamSource } from "@/lib/realtime/stream-client";
import type { StreamPayload, StreamStatus } from "@/lib/realtime/stream-payload";

export { parseStreamPayload } from "@/lib/realtime/stream-payload";
export type { StreamPayload, StreamStatus } from "@/lib/realtime/stream-payload";

/**
 * One live connection per mount: the rules for reconnecting, the scheduled
 * handoff and what a reopening screen must do are in stream-client.ts, where
 * they are tested. Every `update` calls onUpdate() with what it says changed;
 * that names an order, never carries one, and the data itself always comes
 * back through the normal, already-authorized read.
 */
export function useEventStream(url: string, onUpdate: (payload: StreamPayload | null) => void): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(
    () =>
      connectStream(
        url,
        { onUpdate: (payload) => onUpdateRef.current(payload), onStatus: setStatus },
        {
          createSource: (target) => new EventSource(target) as unknown as StreamSource,
          setTimeout: (fn, ms) => setTimeout(fn, ms),
          clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
        }
      ),
    [url]
  );

  return status;
}
