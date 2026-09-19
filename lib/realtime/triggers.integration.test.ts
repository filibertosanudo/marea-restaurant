import { describe, it, expect, afterEach } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { prisma } from "@/lib/prisma";
import { createListenClient } from "./runtime";
import { CHANGE_CHANNEL } from "./events";
import { makeBusiness, makeOrder, makeStaff } from "@/test/factories";

// The trigger function is invisible from application code, so these tests are
// the only place that says what it promises: which writes announce themselves,
// to whom, and with how little.

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Change = { b: string; o: string | null; k: string; s: string | null };

let listener: ReturnType<typeof createListenClient> | null = null;

/** A raw listener, standing in for the app's, that collects every payload for one business. */
async function listenTo(businessId: string) {
  const received: Change[] = [];
  const raw: string[] = [];
  listener = createListenClient(`marea_test_${createId()}`);
  listener.on("notification", (message) => {
    if (message.channel !== CHANGE_CHANNEL || !message.payload) return;
    const change = JSON.parse(message.payload) as Change;
    // NOTIFY channels are database-wide and each test file has its own schema
    // but shares this channel: only this test's business counts.
    if (change.b !== businessId) return;
    raw.push(message.payload);
    received.push(change);
  });
  await listener.connect();
  await listener.query(`LISTEN ${CHANGE_CHANNEL}`);
  return { received, raw };
}

async function settle() {
  await sleep(150);
}

afterEach(async () => {
  await listener?.end().catch(() => {});
  listener = null;
});

describe("realtime triggers", () => {
  it("announces a new order status event with its order, business and status", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id);
    const { received } = await listenTo(business.id);

    await prisma.orderStatusEvent.create({ data: { orderId: order.id, toStatus: "PREPARING" } });
    await settle();

    expect(received).toEqual([{ b: business.id, o: order.id, k: "order", s: "PREPARING" }]);
  });

  it("stays tiny: a change is a few identifiers, never the order, and far from the 8000-byte limit", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id, { guestName: "A Guest With A Long Name", notes: "x".repeat(2000) });
    const { raw } = await listenTo(business.id);

    await prisma.orderStatusEvent.create({ data: { orderId: order.id, toStatus: "READY", note: "y".repeat(2000) } });
    await settle();

    expect(raw).toHaveLength(1);
    expect(Buffer.byteLength(raw[0])).toBeLessThan(300);
    expect(raw[0]).not.toContain("x".repeat(20));
    expect(raw[0]).not.toContain("Guest");
  });

  it("announces a payment when it is created and when it changes, with no status event involved", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id);
    const { received } = await listenTo(business.id);

    const payment = await prisma.payment.create({
      data: { businessId: business.id, orderId: order.id, provider: "CASH_REGISTER", amount: "50.00" },
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "SUCCEEDED" } });
    await settle();

    expect(received).toEqual([
      { b: business.id, o: order.id, k: "payment", s: "PENDING" },
      { b: business.id, o: order.id, k: "payment", s: "SUCCEEDED" },
    ]);
  });

  it("announces the till: a shift opening, closing, and a movement, resolved to the business", async () => {
    const business = await makeBusiness();
    const cashier = await makeStaff("BUSINESS_ADMIN");
    const { received } = await listenTo(business.id);

    const shift = await prisma.cashSession.create({
      data: { businessId: business.id, openedById: cashier.id, openingFloat: "100.00" },
    });
    await prisma.cashMovement.create({
      data: { cashSessionId: shift.id, type: "WITHDRAWAL", amount: "20.00", reason: "produce", createdById: cashier.id },
    });
    await prisma.cashSession.update({ where: { id: shift.id }, data: { closedAt: new Date(), closedById: cashier.id } });
    await settle();

    expect(received.map((c) => c.k)).toEqual(["cash", "cash", "cash"]);
    expect(received.every((c) => c.b === business.id && c.o === null)).toBe(true);
  });

  it("says nothing when the transaction rolls back", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id);
    const { received } = await listenTo(business.id);

    await prisma
      .$transaction(async (tx) => {
        await tx.orderStatusEvent.create({ data: { orderId: order.id, toStatus: "CANCELLED" } });
        throw new Error("the order failed after its status event");
      })
      .catch(() => {});
    await settle();

    expect(received).toEqual([]);
  });

  it("announces at commit, not at the write", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id);
    const { received } = await listenTo(business.id);

    await prisma.$transaction(async (tx) => {
      await tx.orderStatusEvent.create({ data: { orderId: order.id, toStatus: "PREPARING" } });
      await sleep(150);
      expect(received).toEqual([]); // still open: a screen must not refresh to a state nobody can read yet
    });
    await settle();

    expect(received).toHaveLength(1);
  });
});
