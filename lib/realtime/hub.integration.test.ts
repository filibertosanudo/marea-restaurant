import { describe, it, expect, afterEach } from "vitest";
import pg from "pg";
import { prisma } from "@/lib/prisma";
import { RealtimeHub } from "./hub";
import { ListenSource, type ListenClient } from "./listen-source";
import { PollSource } from "./poll-source";
import { sweepChangesSince } from "./sweep";
import { getBoardSignature } from "./signature";
import { createListenClient } from "./runtime";
import type { RealtimeEvent } from "./events";
import { makeBusiness, makeOrder } from "@/test/factories";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(condition: () => boolean, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not met in time");
    await sleep(10);
  }
}

const unsubscribers: Array<() => void> = [];
afterEach(() => {
  for (const stop of unsubscribers.splice(0)) stop();
});

/** A hub wired like production, except the connection is whatever `connect` says and the timers are fast. */
function makeHub(mode: "auto" | "poll", createClient: () => ListenClient) {
  return new RealtimeHub({
    mode,
    createListen: () =>
      new ListenSource({
        createClient,
        sweep: sweepChangesSince,
        heartbeatIntervalMs: 200,
        heartbeatTimeoutMs: 300,
        reconnectBaseMs: 100,
        reconnectMaxMs: 200,
      }),
    createPoll: (businesses, emit) =>
      new PollSource({ businesses, signature: getBoardSignature, onChange: emit, intervalMs: 100 }),
    pollFallbackDelayMs: 150,
    idleGraceMs: 100,
  });
}

const unreachable = () =>
  new pg.Client({
    connectionString: "postgresql://nobody:nothing@127.0.0.1:1/none",
    connectionTimeoutMillis: 200,
  }) as unknown as ListenClient;

describe("degrading to polling", () => {
  it("keeps the board updating when LISTEN cannot be used at all", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id);
    const hub = makeHub("auto", unreachable);
    const seen: RealtimeEvent[] = [];
    unsubscribers.push(hub.subscribe({ businessId: business.id }, (e) => seen.push(e)));

    await until(() => hub.mode === "poll");
    await sleep(250); // let the poller record its baseline
    seen.length = 0;

    await prisma.orderStatusEvent.create({ data: { orderId: order.id, toStatus: "PREPARING" } });

    await until(() => seen.some((e) => e.kind === "reconcile"));
    expect(hub.mode).toBe("poll");
  });

  it("polls from the start when told LISTEN does not work here, and never opens a connection", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id);
    let connections = 0;
    const hub = makeHub("poll", () => {
      connections += 1;
      return unreachable();
    });
    const seen: RealtimeEvent[] = [];
    unsubscribers.push(hub.subscribe({ businessId: business.id }, (e) => seen.push(e)));
    await sleep(250);

    await prisma.orderStatusEvent.create({ data: { orderId: order.id, toStatus: "READY" } });

    await until(() => seen.some((e) => e.kind === "reconcile"));
    expect(connections).toBe(0);
  });

  it("goes back to listening, and stops polling, once LISTEN works", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id);
    let reachable = false;
    const hub = makeHub("auto", () => (reachable ? (createListenClient() as unknown as ListenClient) : unreachable()));
    const seen: RealtimeEvent[] = [];
    unsubscribers.push(hub.subscribe({ businessId: business.id }, (e) => seen.push(e)));
    await until(() => hub.mode === "poll");

    reachable = true;
    await until(() => hub.mode === "listen");
    seen.length = 0;

    await prisma.orderStatusEvent.create({ data: { orderId: order.id, toStatus: "PREPARING" } });

    await until(() => seen.some((e) => e.kind === "order" && e.orderId === order.id));
  });
});

describe("listening", () => {
  it("delivers a change to the business's screens, and to the tracked order's screen only for that order", async () => {
    const business = await makeBusiness();
    const mine = await makeOrder(business.id);
    const other = await makeOrder(business.id);
    const hub = makeHub("auto", () => createListenClient() as unknown as ListenClient);
    const board: RealtimeEvent[] = [];
    const tracked: RealtimeEvent[] = [];
    unsubscribers.push(hub.subscribe({ businessId: business.id }, (e) => board.push(e)));
    unsubscribers.push(hub.subscribe({ businessId: business.id, orderId: mine.id }, (e) => tracked.push(e)));
    await until(() => hub.mode === "listen" && board.length >= 0);
    await sleep(400);
    board.length = 0;
    tracked.length = 0;

    await prisma.orderStatusEvent.create({ data: { orderId: other.id, toStatus: "PREPARING" } });
    await prisma.orderStatusEvent.create({ data: { orderId: mine.id, toStatus: "PREPARING" } });
    await until(() => tracked.length > 0);
    await sleep(100);

    expect(board.filter((e) => e.kind === "order")).toHaveLength(2);
    expect(tracked.filter((e) => e.kind === "order").map((e) => (e.kind === "order" ? e.orderId : null))).toEqual([mine.id]);
  });
});
