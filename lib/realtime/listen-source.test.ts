import { describe, it, expect, afterEach } from "vitest";
import { ListenSource, type ListenClient } from "./listen-source";
import { CHANGE_CHANNEL, PING_CHANNEL, type RealtimeEvent } from "./events";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(condition: () => boolean, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not met in time");
    await sleep(5);
  }
}

type Notification = { channel: string; payload?: string };

class FakeClient implements ListenClient {
  static all: FakeClient[] = [];
  /** Every statement, plus "sweep" when the shared sweep ran, in order. */
  static timeline: string[] = [];
  echoPings = true;
  connectError: Error | null = null;
  private notification: Array<(m: Notification) => void> = [];
  private end_: Array<() => void> = [];
  ended = false;

  constructor() {
    FakeClient.all.push(this);
  }

  async connect() {
    if (this.connectError) throw this.connectError;
  }

  async query(text: string, values?: unknown[]) {
    FakeClient.timeline.push(text.split(" ")[0] === "LISTEN" ? text : "query");
    if (text.startsWith("SELECT pg_notify") && this.echoPings) {
      queueMicrotask(() => this.deliver({ channel: String(values?.[0]), payload: String(values?.[1]) }));
    }
  }

  on(event: string, listener: (...args: never[]) => void) {
    if (event === "notification") this.notification.push(listener as (m: Notification) => void);
    if (event === "end") this.end_.push(listener as () => void);
    return this;
  }

  async end() {
    this.ended = true;
  }

  deliver(message: Notification) {
    for (const listener of this.notification) listener(message);
  }

  /** The server closed the connection. */
  drop() {
    for (const listener of this.end_) listener();
  }
}

let source: ListenSource | null = null;

function make(overrides: Partial<ConstructorParameters<typeof ListenSource>[0]> = {}) {
  const events: RealtimeEvent[] = [];
  const health: boolean[] = [];
  const sweeps: Date[] = [];
  const created: FakeClient[] = [];
  source = new ListenSource({
    createClient: () => {
      const client = new FakeClient();
      created.push(client);
      return client;
    },
    sweep: async (since) => {
      FakeClient.timeline.push("sweep");
      sweeps.push(since);
      return [];
    },
    heartbeatIntervalMs: 20,
    heartbeatTimeoutMs: 30,
    reconnectBaseMs: 10,
    reconnectMaxMs: 40,
    ...overrides,
  });
  source.onEvent((event) => events.push(event));
  source.onHealth((healthy) => health.push(healthy));
  return { source, events, health, sweeps, created };
}

afterEach(async () => {
  await source?.stop();
  source = null;
  FakeClient.all = [];
  FakeClient.timeline = [];
});

describe("ListenSource", () => {
  it("is healthy only once its own ping has come back", async () => {
    const { source: s, health } = make();
    s.start();
    await until(() => s.isHealthy);
    expect(health).toEqual([true]);
  });

  it("turns a change notification into an event, and ignores what it cannot parse", async () => {
    const { source: s, events, created } = make();
    s.start();
    await until(() => s.isHealthy);

    created[0].deliver({ channel: CHANGE_CHANNEL, payload: '{"b":"biz","o":"ord","k":"order","s":"READY"}' });
    created[0].deliver({ channel: CHANGE_CHANNEL, payload: "garbage" });
    created[0].deliver({ channel: "some_other_channel", payload: '{"b":"biz","o":"x","k":"order","s":null}' });

    expect(events).toEqual([{ kind: "order", businessId: "biz", orderId: "ord", status: "READY" }]);
  });

  it("goes unhealthy and reconnects when the connection ends", async () => {
    const { source: s, health, created } = make();
    s.start();
    await until(() => s.isHealthy);

    created[0].drop();
    await until(() => created.length === 2 && s.isHealthy);

    expect(health).toEqual([true, false, true]);
    expect(created[0].ended).toBe(true);
  });

  it("LISTENs before it sweeps, so nothing can slip between the two", async () => {
    const { source: s, created } = make();
    s.start();
    await until(() => s.isHealthy);
    FakeClient.timeline = [];

    created[0].drop();
    await until(() => created.length === 2 && s.isHealthy);

    const sweepAt = FakeClient.timeline.indexOf("sweep");
    const listenAt = FakeClient.timeline.indexOf(`LISTEN ${CHANGE_CHANNEL}`);
    expect(listenAt).toBeGreaterThanOrEqual(0);
    expect(sweepAt).toBeGreaterThan(listenAt);
  });

  it("sweeps from the last healthy moment, widened by the recovery window", async () => {
    let clock = 1_000_000;
    const { source: s, created, sweeps } = make({ now: () => clock, recoveryWindowMs: 15_000 });
    s.start();
    await until(() => s.isHealthy);
    expect(sweeps).toEqual([]); // nothing to recover on the very first connect

    clock = 1_500_000;
    created[0].drop();
    await until(() => sweeps.length === 1 && s.isHealthy);

    // lastHealthyAt is the clock at the last ping echo (1_000_000, later heartbeats read the moving clock).
    expect(sweeps[0].getTime()).toBeLessThanOrEqual(1_500_000 - 15_000);
    expect(sweeps[0].getTime()).toBeGreaterThanOrEqual(1_000_000 - 15_000);
  });

  it("emits what the sweep found", async () => {
    const swept: RealtimeEvent = { kind: "payment", businessId: "biz", orderId: "ord", status: null };
    const { source: s, events, created } = make({ sweep: async () => [swept] });
    s.start();
    await until(() => s.isHealthy);
    created[0].drop();
    await until(() => created.length === 2 && s.isHealthy);
    expect(events).toContainEqual(swept);
  });

  it("does not claim health until a failed sweep has succeeded, and keeps the same starting point", async () => {
    let attempts = 0;
    const since: Date[] = [];
    const { source: s, health, created } = make({
      sweep: async (from) => {
        since.push(from);
        attempts += 1;
        if (attempts === 1) throw new Error("database hiccup");
        return [];
      },
    });
    s.start();
    await until(() => s.isHealthy);
    created[0].drop();
    await until(() => attempts >= 2 && s.isHealthy);

    expect(health).toEqual([true, false, true]);
    expect(since[1].getTime()).toBe(since[0].getTime());
  });

  it("declares the channel dead when a heartbeat gets no echo, then recovers on a fresh connection", async () => {
    const { source: s, health, created } = make();
    s.start();
    await until(() => s.isHealthy);

    created[0].echoPings = false; // still connected, no longer delivering
    await until(() => created.length === 2 && s.isHealthy);

    expect(health).toEqual([true, false, true]);
    expect(created[0].ended).toBe(true);
  });

  it("never becomes healthy on a connection that accepts LISTEN but never delivers", async () => {
    const { source: s, health } = make({
      createClient: () => {
        const client = new FakeClient();
        client.echoPings = false; // the shape of a transaction-mode pooler
        return client;
      },
    });
    s.start();
    await sleep(150);
    expect(s.isHealthy).toBe(false);
    expect(health).toEqual([]);
  });

  it("keeps retrying while the database is unreachable, and stops when told to", async () => {
    let attempts = 0;
    const { source: s } = make({
      createClient: () => {
        attempts += 1;
        const client = new FakeClient();
        client.connectError = new Error("ECONNREFUSED");
        return client;
      },
    });
    s.start();
    await until(() => attempts >= 3);
    await s.stop();
    const after = attempts;
    await sleep(80);
    expect(attempts).toBe(after);
    expect(s.isHealthy).toBe(false);
  });

  it("answers only its own pings", async () => {
    const { source: s, created } = make({ heartbeatTimeoutMs: 60 });
    s.start();
    await until(() => s.isHealthy);
    created[0].echoPings = false;
    // A foreign ping (another replica's) on the same channel must not satisfy ours.
    created[0].deliver({ channel: PING_CHANNEL, payload: "someone-else" });
    await until(() => created.length === 2);
  });
});
