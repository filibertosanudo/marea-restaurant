import { describe, it, expect, afterEach } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import pg from "pg";
import { prisma } from "@/lib/prisma";
import { createListenClient } from "./runtime";
import { ListenSource, type ListenClient } from "./listen-source";
import { sweepChangesSince } from "./sweep";
import { RECOVERY_WINDOW_MS } from "./timing";
import type { RealtimeEvent } from "./events";
import { makeBusiness, makeOrder, makeStaff } from "@/test/factories";

// The three things a reader of the docs would not find out: a notification sent
// while the connection is down is never redelivered; a connection can be up and
// deaf; and an event can commit after a newer one was seen while carrying an
// older timestamp. Each one is provoked here on a real Postgres.

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(condition: () => boolean, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not met in time");
    await sleep(10);
  }
}

let source: ListenSource | null = null;
const cleanup: Array<() => Promise<unknown>> = [];

afterEach(async () => {
  await source?.stop();
  source = null;
  for (const fn of cleanup.splice(0)) await fn().catch(() => {});
});

/** A source with fast timers, listening on a connection named so the test can kill exactly it. */
function start(overrides: Partial<ConstructorParameters<typeof ListenSource>[0]> = {}) {
  const applicationName = `marea_test_${createId()}`;
  const events: RealtimeEvent[] = [];
  const health: boolean[] = [];
  source = new ListenSource({
    createClient: () => createListenClient(applicationName) as unknown as ListenClient,
    sweep: sweepChangesSince,
    heartbeatIntervalMs: 100,
    heartbeatTimeoutMs: 400,
    reconnectBaseMs: 200,
    reconnectMaxMs: 400,
    ...overrides,
  });
  source.onEvent((event) => events.push(event));
  source.onHealth((healthy) => health.push(healthy));
  source.start();
  return { source, events, health, applicationName };
}

/** Kills the LISTEN connection from the server side, the way a restart or a network cut would. */
async function killListen(applicationName: string) {
  await prisma.$queryRaw`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = ${applicationName}`;
}

function sawOrder(events: RealtimeEvent[], orderId: string) {
  return events.some((e) => e.kind !== "reconcile" && e.orderId === orderId);
}

describe("a live change", () => {
  it("reaches the listener as soon as it commits", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id);
    const { source: s, events } = start();
    await until(() => s.isHealthy);

    await prisma.orderStatusEvent.create({ data: { orderId: order.id, toStatus: "PREPARING" } });

    await until(() => sawOrder(events, order.id));
  });
});

describe("killing the LISTEN connection", () => {
  it("loses no change made while it was down: the sweep after reconnecting finds them all", async () => {
    const business = await makeBusiness();
    const cashier = await makeStaff("BUSINESS_ADMIN");
    const orderA = await makeOrder(business.id);
    const orderB = await makeOrder(business.id);
    const { source: s, events, health, applicationName } = start();
    await until(() => s.isHealthy);

    await killListen(applicationName);
    await until(() => !s.isHealthy);

    // Changes of all three kinds while nobody is listening.
    await prisma.orderStatusEvent.create({ data: { orderId: orderA.id, toStatus: "PREPARING" } });
    await prisma.payment.create({
      data: { businessId: business.id, orderId: orderB.id, provider: "CASH_REGISTER", amount: "10.00" },
    });
    await prisma.cashSession.create({
      data: { businessId: business.id, openedById: cashier.id, openingFloat: "0.00" },
    });

    await until(() => s.isHealthy);

    expect(sawOrder(events, orderA.id)).toBe(true);
    expect(events).toContainEqual({ kind: "payment", businessId: business.id, orderId: orderB.id, status: null });
    expect(events).toContainEqual({ kind: "cash", businessId: business.id, orderId: null, status: null });
    expect(health).toEqual([true, false, true]);
  });

  it("does not redeliver the missed notification on its own: without the sweep it is simply gone", async () => {
    // The control for the test above: the same drop with the recovery turned
    // off shows what the sweep is compensating for.
    const business = await makeBusiness();
    const order = await makeOrder(business.id);
    const { source: s, events, applicationName } = start({ sweep: async () => [] });
    await until(() => s.isHealthy);

    await killListen(applicationName);
    await until(() => !s.isHealthy);
    await prisma.orderStatusEvent.create({ data: { orderId: order.id, toStatus: "PREPARING" } });
    await until(() => s.isHealthy);
    await sleep(300);

    expect(sawOrder(events, order.id)).toBe(false);
  });

  it("keeps delivering live after recovering", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id);
    const { source: s, events, applicationName } = start();
    await until(() => s.isHealthy);
    await killListen(applicationName);
    await until(() => !s.isHealthy);
    await until(() => s.isHealthy);

    await prisma.orderStatusEvent.create({ data: { orderId: order.id, toStatus: "READY" } });

    await until(() => sawOrder(events, order.id));
  });
});

describe("an event that commits after the cursor moved past its timestamp", () => {
  /** Opens a transaction on its own connection, stamps an event with `stampedAt`, and leaves it uncommitted. */
  async function openSlowTransaction(orderId: string, stampedAt: Date) {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    cleanup.push(() => client.end());
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO "OrderStatusEvent" (id, "orderId", "toStatus", "createdAt") VALUES ($1, $2, 'PREPARING', $3::timestamp)`,
      [createId(), orderId, stampedAt.toISOString()]
    );
    return client;
  }

  it("is invisible to a cursor that trusts timestamps, and found by the recovery window", async () => {
    const business = await makeBusiness();
    const slow = await makeOrder(business.id);
    const fast = await makeOrder(business.id);

    const stampedAt = new Date();
    const client = await openSlowTransaction(slow.id, stampedAt);

    await sleep(50);
    await prisma.orderStatusEvent.create({ data: { orderId: fast.id, toStatus: "PREPARING" } });
    // The cursor a naive listener would hold: the newest timestamp it has seen.
    const cursor = new Date();

    await client.query("COMMIT"); // committed after the cursor, stamped before it

    const naive = await sweepChangesSince(cursor);
    expect(naive.some((e) => e.kind !== "reconcile" && e.orderId === slow.id)).toBe(false);

    const withWindow = await sweepChangesSince(new Date(cursor.getTime() - RECOVERY_WINDOW_MS));
    expect(withWindow.some((e) => e.kind !== "reconcile" && e.orderId === slow.id)).toBe(true);
    expect(withWindow.some((e) => e.kind !== "reconcile" && e.orderId === fast.id)).toBe(true);
  });

  it("is recovered by the listener: the slow transaction commits while the connection is down", async () => {
    const business = await makeBusiness();
    const slow = await makeOrder(business.id);
    const { source: s, events, applicationName } = start();
    await until(() => s.isHealthy);

    const client = await openSlowTransaction(slow.id, new Date());
    // Long enough for several heartbeats, so the listener's own idea of "last
    // healthy" moves past the event's timestamp before the event is visible.
    await sleep(450);
    await killListen(applicationName);
    await until(() => !s.isHealthy);
    await client.query("COMMIT"); // its notification goes to nobody

    await until(() => s.isHealthy);

    expect(sawOrder(events, slow.id)).toBe(true);
  });
});

describe("a connection that is up but deaf", () => {
  /** Wraps the real client and, while `deaf` is set, drops every notification: what a transaction-mode pooler does. */
  function deafWrapper(applicationName: string, state: { deaf: boolean }): ListenClient {
    const real = createListenClient(applicationName);
    return {
      connect: () => real.connect(),
      query: (text, values) => real.query(text, values),
      on: ((event: string, listener: (...args: never[]) => void) => {
        if (event === "notification") {
          real.on("notification", (message) => {
            if (!state.deaf) (listener as (m: typeof message) => void)(message);
          });
        } else {
          real.on(event as "end", listener as () => void);
        }
        return real;
      }) as ListenClient["on"],
      end: () => real.end(),
    };
  }

  it("never claims to be healthy, so the hub falls back to polling", async () => {
    const applicationName = `marea_test_${createId()}`;
    const { source: s, health } = start({
      createClient: () => deafWrapper(applicationName, { deaf: true }),
      heartbeatTimeoutMs: 200,
    });
    await sleep(900);

    expect(s.isHealthy).toBe(false);
    expect(health).toEqual([]);
  });

  it("notices when a healthy channel goes deaf, and recovers on a fresh connection", async () => {
    const applicationName = `marea_test_${createId()}`;
    const states: Array<{ deaf: boolean }> = [];
    const { source: s, health } = start({
      createClient: () => {
        const state = { deaf: false };
        states.push(state);
        return deafWrapper(applicationName, state);
      },
      heartbeatIntervalMs: 100,
      heartbeatTimeoutMs: 250,
    });
    await until(() => s.isHealthy);

    states[0].deaf = true; // the connection stays up; the channel stops delivering
    await until(() => states.length === 2 && s.isHealthy);

    expect(health).toEqual([true, false, true]);
  });
});

describe("a database that cannot be reached", () => {
  it("never becomes healthy, keeps retrying, and stops cleanly", async () => {
    let attempts = 0;
    const { source: s, health } = start({
      createClient: () => {
        attempts += 1;
        return new pg.Client({
          connectionString: "postgresql://nobody:nothing@127.0.0.1:1/none",
          connectionTimeoutMillis: 300,
        }) as unknown as ListenClient;
      },
      reconnectBaseMs: 50,
      reconnectMaxMs: 100,
    });
    await until(() => attempts >= 3);
    await s.stop();

    expect(s.isHealthy).toBe(false);
    expect(health).toEqual([]);
  });
});
