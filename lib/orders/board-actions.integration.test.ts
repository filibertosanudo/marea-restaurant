import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  advanceOrderStatusAction,
  cancelOrderAction,
  collectCashPaymentAction,
} from "./board-actions";
import { makeBusiness, makeMenuCategory, makeMenuItem, makeStaff } from "@/test/factories";
import { setTestSession, sessionUserFromRow } from "@/test/stubs/auth-session";
import { runConcurrently, partitionSettled } from "@/test/concurrency";

/** board-actions.ts calls getCurrentBusiness(), which looks a Business up by a fixed slug — not by id, unlike create-order.ts. */
function makeCurrentBusiness() {
  return makeBusiness({ slug: "marea" });
}

async function loginAs(role: "STAFF" | "BUSINESS_ADMIN") {
  const user = await makeStaff(role);
  setTestSession(sessionUserFromRow(user));
  return user;
}

async function makeOrderWithCashPayment(businessId: string, overrides: Record<string, unknown> = {}) {
  const order = await prisma.order.create({
    data: { businessId, orderNumber: `A-${Math.random().toString(36).slice(2, 8)}`, total: "23.19", ...overrides },
  });
  const payment = await prisma.payment.create({
    data: { businessId, orderId: order.id, provider: "CASH_REGISTER", status: "PENDING", amount: order.total },
  });
  return { order, payment };
}

describe("advanceOrderStatusAction", () => {
  it("advances one legal step", async () => {
    const business = await makeCurrentBusiness();
    await loginAs("STAFF");
    const { order } = await makeOrderWithCashPayment(business.id, { status: "PENDING" });

    await advanceOrderStatusAction(order.id);

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe("PREPARING");
  });

  it("enqueues an order.ready notification when advancing to READY for a guest with an email", async () => {
    const business = await makeCurrentBusiness();
    await loginAs("STAFF");
    const { order } = await makeOrderWithCashPayment(business.id, {
      status: "PREPARING",
      guestEmail: "ana@example.com",
    });

    await advanceOrderStatusAction(order.id);

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe("READY");
    expect(updated.readyAt).not.toBeNull();
    const job = await prisma.notificationJob.findFirst({ where: { relatedOrderId: order.id } });
    expect(job?.templateKey).toBe("order.ready");
  });

  it("rejects advancing past a terminal status instead of skipping ahead", async () => {
    const business = await makeCurrentBusiness();
    await loginAs("STAFF");
    const { order } = await makeOrderWithCashPayment(business.id, {
      status: "DELIVERED",
      completedAt: new Date(),
    });

    const result = await advanceOrderStatusAction(order.id);

    expect(result).toEqual({ error: "no_next_status" });
    const unchanged = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(unchanged.status).toBe("DELIVERED");
  });
});

describe("cancelOrderAction", () => {
  it("enqueues an order.cancelled notification for a guest with an email", async () => {
    const business = await makeCurrentBusiness();
    await loginAs("BUSINESS_ADMIN");
    const { order } = await makeOrderWithCashPayment(business.id, {
      status: "PENDING",
      guestEmail: "ana@example.com",
    });

    await cancelOrderAction(order.id, "guest called to cancel");

    const job = await prisma.notificationJob.findFirst({ where: { relatedOrderId: order.id } });
    expect(job?.templateKey).toBe("order.cancelled");
  });

  it("returns tracked inventory and restores availability once stock crosses back above zero", async () => {
    const business = await makeCurrentBusiness();
    await loginAs("BUSINESS_ADMIN");
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, {
      trackInventory: true,
      stockQuantity: 0,
      isAvailable: false,
    });
    const { order } = await makeOrderWithCashPayment(business.id, { status: "PENDING" });
    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        menuItemId: item.id,
        nameSnapshot: "Test dish",
        unitPrice: "10.00",
        quantity: 2,
        lineTotal: "20.00",
      },
    });

    const result = await cancelOrderAction(order.id, "guest changed their mind");

    expect(result).toBeUndefined();
    const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updatedOrder.status).toBe("CANCELLED");
    const updatedItem = await prisma.menuItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(updatedItem.stockQuantity).toBe(2);
    expect(updatedItem.isAvailable).toBe(true);
  });

  it("cancels the still-open cash payment along with the order", async () => {
    const business = await makeCurrentBusiness();
    await loginAs("BUSINESS_ADMIN");
    const { order, payment } = await makeOrderWithCashPayment(business.id, { status: "PENDING" });

    await cancelOrderAction(order.id, "no longer available");

    const updatedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updatedPayment.status).toBe("CANCELLED");
  });
});

describe("collectCashPaymentAction", () => {
  it("refuses to collect cash on an order already settled by card", async () => {
    const business = await makeCurrentBusiness();
    await loginAs("STAFF");
    const { order, payment } = await makeOrderWithCashPayment(business.id, { status: "PENDING" });
    await prisma.payment.create({
      data: {
        businessId: business.id,
        orderId: order.id,
        provider: "STRIPE",
        status: "SUCCEEDED",
        amount: order.total,
        stripePaymentIntentId: "pi_already_paid",
      },
    });

    const result = await collectCashPaymentAction(order.id);

    expect(result).toEqual({ error: "already_settled" });
    const unchanged = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(unchanged.status).toBe("PENDING");
  });

  it("collects cash normally when nothing else has settled the order", async () => {
    const business = await makeCurrentBusiness();
    await loginAs("STAFF");
    const { order, payment } = await makeOrderWithCashPayment(business.id, { status: "PENDING" });

    const result = await collectCashPaymentAction(order.id);

    expect(result).toBeUndefined();
    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.status).toBe("SUCCEEDED");
  });

  it("a concurrent collect and cancel on the same order: one wins, the other fails cleanly", async () => {
    const business = await makeCurrentBusiness();
    // BUSINESS_ADMIN satisfies both actions' role checks (it's in STAFF_ROLES
    // too) — this test is about the Order-row race, not about permissions.
    await loginAs("BUSINESS_ADMIN");
    const { order } = await makeOrderWithCashPayment(business.id, { status: "PENDING" });

    const results = await runConcurrently([
      () => collectCashPaymentAction(order.id),
      () => cancelOrderAction(order.id, "double-booked table"),
    ]);
    const { fulfilled } = partitionSettled(results);

    // Both actions return a result object rather than throwing even on
    // their "didn't work" path, so this is really asserting neither call
    // threw an uncaught error under contention — the actual outcome
    // (which one "won") is asserted below.
    expect(fulfilled).toHaveLength(2);

    const finalOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { payments: true },
    });
    const cashPayment = finalOrder.payments.find((p) => p.provider === "CASH_REGISTER")!;

    // Whichever ran first wins outright; the loser must observe that and
    // report a clean, defined error — not silently apply its own side on
    // top. The one outcome that must never happen either way: a cancelled
    // order sitting next to a payment that still says it was collected.
    if (finalOrder.status === "CANCELLED") {
      expect(cashPayment.status).toBe("CANCELLED");
    } else {
      expect(cashPayment.status).toBe("SUCCEEDED");
    }
    expect(finalOrder.status === "CANCELLED" && cashPayment.status === "SUCCEEDED").toBe(false);
  });
});
