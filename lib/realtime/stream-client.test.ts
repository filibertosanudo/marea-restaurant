import { describe, it, expect } from "vitest";
import { connectStream, BASE_RETRY_MS, MAX_RETRY_MS, type StreamSource } from "./stream-client";
import type { StreamPayload, StreamStatus } from "./stream-payload";

class FakeSource implements StreamSource {
  closed = false;
  private listeners = new Map<string, Array<(event: { data?: unknown }) => void>>();
  addEventListener(type: string, listener: (event: { data?: unknown }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data?: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }
}

function setup() {
  const sources: FakeSource[] = [];
  const updates: Array<StreamPayload | null> = [];
  const statuses: StreamStatus[] = [];
  const timers: Array<{ fn: () => void; ms: number; cleared: boolean }> = [];
  const stop = connectStream(
    "/stream",
    { onUpdate: (payload) => updates.push(payload), onStatus: (status) => statuses.push(status) },
    {
      createSource: () => {
        const source = new FakeSource();
        sources.push(source);
        return source;
      },
      setTimeout: (fn, ms) => {
        const timer = { fn, ms, cleared: false };
        timers.push(timer);
        return timer;
      },
      clearTimeout: (handle) => {
        (handle as { cleared: boolean }).cleared = true;
      },
    }
  );
  return { sources, updates, statuses, timers, stop };
}

const change = '{"changes":[{"kind":"order","orderId":"o1","status":"READY"}]}';

describe("connecting", () => {
  it("goes connecting then open, and does not refresh on the first open", () => {
    const { sources, updates, statuses } = setup();
    sources[0].emit("open");
    expect(statuses).toEqual(["connecting", "open"]);
    expect(updates).toEqual([]);
  });

  it("hands each update's parsed changes to the screen", () => {
    const { sources, updates } = setup();
    sources[0].emit("open");
    sources[0].emit("update", change);
    sources[0].emit("update", "");
    expect(updates).toEqual([{ changes: [{ kind: "order", orderId: "o1", status: "READY" }] }, null]);
  });
});

describe("the scheduled handoff", () => {
  it("opens the replacement before closing the old stream, which keeps delivering meanwhile", () => {
    const { sources, updates } = setup();
    sources[0].emit("open");

    sources[0].emit("reconnect");
    expect(sources).toHaveLength(2);
    expect(sources[0].closed).toBe(false);

    // The gap the load test found: an order announced now must not be lost.
    sources[0].emit("update", change);
    expect(updates).toEqual([{ changes: [{ kind: "order", orderId: "o1", status: "READY" }] }]);

    sources[1].emit("open");
    expect(sources[0].closed).toBe(true);
    expect(sources[1].closed).toBe(false);
  });

  it("neither refreshes nor flickers offline, and carries on from the replacement", () => {
    const { sources, updates, statuses } = setup();
    sources[0].emit("open");
    sources[0].emit("reconnect");
    sources[1].emit("open");
    sources[1].emit("update", change);

    expect(statuses).toEqual(["connecting", "open"]);
    expect(updates).toEqual([{ changes: [{ kind: "order", orderId: "o1", status: "READY" }] }]);
  });

  it("stays on the old stream when the replacement cannot open, and treats the old one ending as a drop", () => {
    const { sources, statuses, timers } = setup();
    sources[0].emit("open");
    sources[0].emit("reconnect");

    sources[1].emit("error");
    expect(sources[1].closed).toBe(true);
    expect(sources[0].closed).toBe(false);
    expect(statuses).toEqual(["connecting", "open"]);

    sources[0].emit("error");
    expect(statuses[statuses.length - 1]).toBe("offline");
    expect(timers).toHaveLength(1);
  });

  it("ignores a reconnect from a stream it has already replaced", () => {
    const { sources } = setup();
    sources[0].emit("open");
    sources[0].emit("reconnect");
    sources[1].emit("open");
    sources[0].emit("reconnect");
    expect(sources).toHaveLength(2);
  });
});

describe("a dropped connection", () => {
  it("goes offline, retries with growing delays, and refreshes when it is back", () => {
    const { sources, updates, statuses, timers } = setup();
    sources[0].emit("open");

    sources[0].emit("error");
    expect(statuses).toEqual(["connecting", "open", "offline"]);
    expect(timers[0].ms).toBe(BASE_RETRY_MS);

    timers[0].fn(); // the retry fires
    expect(sources).toHaveLength(2);
    sources[1].emit("error"); // still down
    expect(timers[1].ms).toBe(BASE_RETRY_MS * 2);

    timers[1].fn();
    sources[2].emit("open");
    expect(statuses[statuses.length - 1]).toBe("open");
    expect(updates).toEqual([{ reconcile: true }]);
  });

  it("caps the retry delay", () => {
    const { sources, timers } = setup();
    for (let i = 0; i < 12; i++) {
      sources[i].emit("error");
      timers[i].fn();
    }
    expect(Math.max(...timers.map((t) => t.ms))).toBe(MAX_RETRY_MS);
  });
});

describe("stopping", () => {
  it("closes the stream, cancels a pending retry, and ignores anything after", () => {
    const { sources, updates, timers, stop } = setup();
    sources[0].emit("open");
    sources[0].emit("error");
    stop();
    expect(timers[0].cleared).toBe(true);

    const opened = sources.length;
    timers[0].fn();
    expect(sources).toHaveLength(opened);
    sources[0].emit("update", change);
    expect(updates).toEqual([]);
  });

  it("closes the live stream", () => {
    const { sources, stop } = setup();
    sources[0].emit("open");
    stop();
    expect(sources[0].closed).toBe(true);
  });
});
