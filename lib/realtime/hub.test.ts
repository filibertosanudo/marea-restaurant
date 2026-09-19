import { describe, it, expect } from "vitest";
import { RealtimeHub, type RealtimeHubOptions } from "./hub";
import type { RealtimeEvent } from "./events";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class FakeListen {
  started = 0;
  stopped = 0;
  healthy = false;
  private eventHandler: (event: RealtimeEvent) => void = () => {};
  private healthHandler: (healthy: boolean) => void = () => {};
  get isHealthy() {
    return this.healthy;
  }
  start() {
    this.started += 1;
  }
  async stop() {
    this.stopped += 1;
  }
  onEvent(handler: (event: RealtimeEvent) => void) {
    this.eventHandler = handler;
  }
  onHealth(handler: (healthy: boolean) => void) {
    this.healthHandler = handler;
  }
  emit(event: RealtimeEvent) {
    this.eventHandler(event);
  }
  setHealthy(healthy: boolean) {
    this.healthy = healthy;
    this.healthHandler(healthy);
  }
}

class FakePoll {
  started = 0;
  stopped = 0;
  constructor(
    readonly businesses: () => string[],
    readonly emit: (event: RealtimeEvent) => void
  ) {}
  start() {
    this.started += 1;
  }
  stop() {
    this.stopped += 1;
  }
}

function make(overrides: Partial<RealtimeHubOptions> = {}) {
  const listens: FakeListen[] = [];
  const polls: FakePoll[] = [];
  const hub = new RealtimeHub({
    mode: "auto",
    createListen: () => {
      const listen = new FakeListen();
      listens.push(listen);
      return listen;
    },
    createPoll: (businesses, emit) => {
      const poll = new FakePoll(businesses, emit);
      polls.push(poll);
      return poll;
    },
    pollFallbackDelayMs: 20,
    idleGraceMs: 20,
    ...overrides,
  });
  return { hub, listens, polls };
}

const order = (businessId: string, orderId: string): RealtimeEvent => ({ kind: "order", businessId, orderId, status: "READY" });

describe("RealtimeHub routing", () => {
  it("gives a board every change in its business and nothing from another", () => {
    const { hub, listens } = make();
    const seen: RealtimeEvent[] = [];
    hub.subscribe({ businessId: "biz" }, (e) => seen.push(e));
    listens[0].emit(order("biz", "o1"));
    listens[0].emit(order("other", "o2"));
    listens[0].emit({ kind: "cash", businessId: "biz", orderId: null, status: null });
    expect(seen.map((e) => (e.kind === "reconcile" ? null : e.kind))).toEqual(["order", "cash"]);
  });

  it("gives a tracked order its own changes only", () => {
    const { hub, listens } = make();
    const seen: RealtimeEvent[] = [];
    hub.subscribe({ businessId: "biz", orderId: "mine" }, (e) => seen.push(e));
    listens[0].emit(order("biz", "someone-elses"));
    listens[0].emit({ kind: "cash", businessId: "biz", orderId: null, status: null });
    listens[0].emit(order("biz", "mine"));
    expect(seen).toHaveLength(1);
  });

  it("lets a failing subscriber not stop the others", () => {
    const { hub, listens } = make();
    const seen: RealtimeEvent[] = [];
    hub.subscribe({ businessId: "biz" }, () => {
      throw new Error("screen exploded");
    });
    hub.subscribe({ businessId: "biz" }, (e) => seen.push(e));
    listens[0].emit(order("biz", "o1"));
    expect(seen).toHaveLength(1);
  });

  it("opens one listener for any number of screens", () => {
    const { hub, listens } = make();
    hub.subscribe({ businessId: "biz" }, () => {});
    hub.subscribe({ businessId: "biz" }, () => {});
    hub.subscribe({ businessId: "biz", orderId: "o" }, () => {});
    expect(listens).toHaveLength(1);
    expect(listens[0].started).toBe(1);
  });
});

describe("RealtimeHub degrading", () => {
  it("falls back to polling when listening stays unhealthy, and says so with a reconcile", async () => {
    const { hub, polls } = make();
    const seen: RealtimeEvent[] = [];
    hub.subscribe({ businessId: "biz" }, (e) => seen.push(e));
    expect(hub.mode).toBe("listen");

    await sleep(60);

    expect(polls).toHaveLength(1);
    expect(polls[0].started).toBe(1);
    expect(hub.mode).toBe("poll");
    expect(seen).toContainEqual({ kind: "reconcile", businessId: null });
  });

  it("does not start a poller when listening comes up in time, but reconciles once", async () => {
    const { hub, listens, polls } = make();
    const seen: RealtimeEvent[] = [];
    hub.subscribe({ businessId: "biz" }, (e) => seen.push(e));
    listens[0].setHealthy(true);
    await sleep(60);
    expect(polls).toHaveLength(0);
    // Whatever happened between the screen rendering and LISTEN being in place is unknown.
    expect(seen).toEqual([{ kind: "reconcile", businessId: null }]);
  });

  it("stops polling and reconciles when listening recovers", async () => {
    const { hub, listens, polls } = make();
    const seen: RealtimeEvent[] = [];
    hub.subscribe({ businessId: "biz" }, (e) => seen.push(e));
    await sleep(60);
    expect(hub.mode).toBe("poll");
    seen.length = 0;

    listens[0].setHealthy(true);

    expect(polls[0].stopped).toBe(1);
    expect(hub.mode).toBe("listen");
    expect(seen).toContainEqual({ kind: "reconcile", businessId: null });
  });

  it("falls back after a healthy connection drops", async () => {
    const { hub, listens, polls } = make();
    hub.subscribe({ businessId: "biz" }, () => {});
    listens[0].setHealthy(true);
    listens[0].setHealthy(false);
    await sleep(60);
    expect(polls).toHaveLength(1);
  });

  it("never listens when told to poll", () => {
    const { hub, listens, polls } = make({ mode: "poll" });
    hub.subscribe({ businessId: "biz" }, () => {});
    expect(listens).toHaveLength(0);
    expect(polls[0].started).toBe(1);
    expect(hub.mode).toBe("poll");
  });

  it("hands the poller the businesses somebody is watching right now", () => {
    const { hub, polls } = make({ mode: "poll" });
    const stop = hub.subscribe({ businessId: "a" }, () => {});
    hub.subscribe({ businessId: "b", orderId: "o" }, () => {});
    expect(polls[0].businesses().sort()).toEqual(["a", "b"]);
    stop();
    expect(polls[0].businesses()).toEqual(["b"]);
  });
});

describe("RealtimeHub lifetime", () => {
  it("closes the connection after the last screen leaves, and reopens for the next", async () => {
    const { hub, listens } = make();
    const stop = hub.subscribe({ businessId: "biz" }, () => {});
    stop();
    expect(hub.mode).toBe("listen");
    await sleep(60);
    expect(listens[0].stopped).toBe(1);
    expect(hub.mode).toBe("idle");

    hub.subscribe({ businessId: "biz" }, () => {});
    expect(listens).toHaveLength(2);
    expect(hub.mode).toBe("listen");
  });

  it("keeps the connection when a screen comes back within the grace period", async () => {
    const { hub, listens } = make();
    const stop = hub.subscribe({ businessId: "biz" }, () => {});
    stop();
    hub.subscribe({ businessId: "biz" }, () => {});
    await sleep(60);
    expect(listens).toHaveLength(1);
    expect(listens[0].stopped).toBe(0);
  });
});
