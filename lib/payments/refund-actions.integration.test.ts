import { describe, it, expect, vi, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe/client";
import { createRefundAction } from "./refund-actions";
import { makeBusiness, makeOrder, makeStaff } from "@/test/factories";
import { setTestSession, sessionUserFromRow } from "@/test/stubs/auth-session";

async function loginAsAdmin() {
  const user = await makeStaff("BUSINESS_ADMIN");
  setTestSession(sessionUserFromRow(user));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createRefundAction", () => {
  it("rejects an empty reason before looking at anything else", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const order = await makeOrder(business.id);

    const result = await createRefundAction(order.id, { mode: "FULL", amount: "0", reason: "   " });

    expect(result).toEqual({ ok: false, error: "reason_required" });
  });

  it("reports nothing_refundable when no payment ever succeeded", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const order = await makeOrder(business.id, { total: "23.19" });
    await prisma.payment.create({
      data: { businessId: business.id, orderId: order.id, provider: "CASH_REGISTER", status: "PENDING", amount: "23.19" },
    });

    const result = await createRefundAction(order.id, { mode: "FULL", amount: "0", reason: "guest cancelled" });

    expect(result).toEqual({ ok: false, error: "nothing_refundable" });
  });

  it("refunds a cash payment in full without any Stripe call", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const order = await makeOrder(business.id, { total: "23.19" });
    const payment = await prisma.payment.create({
      data: { businessId: business.id, orderId: order.id, provider: "CASH_REGISTER", status: "SUCCEEDED", amount: "23.19" },
    });

    const result = await createRefundAction(order.id, { mode: "FULL", amount: "0", reason: "spilled the order" });

    expect(result.ok).toBe(true);
    const refunds = await prisma.refund.findMany({ where: { paymentId: payment.id } });
    expect(refunds).toHaveLength(1);
    expect(refunds[0].status).toBe("SUCCEEDED");
    expect(refunds[0].amount.toString()).toBe("23.19");
    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.status).toBe("REFUNDED");
  });

  it("rejects a partial amount larger than what's refundable", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const order = await makeOrder(business.id, { total: "23.19" });
    await prisma.payment.create({
      data: { businessId: business.id, orderId: order.id, provider: "CASH_REGISTER", status: "SUCCEEDED", amount: "23.19" },
    });

    const result = await createRefundAction(order.id, { mode: "PARTIAL", amount: "100.00", reason: "too much" });

    expect(result).toEqual({ ok: false, error: "amount_exceeds_refundable" });
  });

  it("refunds a card payment through Stripe, recording the returned refund id", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const order = await makeOrder(business.id, { total: "23.19" });
    const payment = await prisma.payment.create({
      data: {
        businessId: business.id,
        orderId: order.id,
        provider: "STRIPE",
        status: "SUCCEEDED",
        amount: "23.19",
        stripePaymentIntentId: "pi_refund_test",
      },
    });
    vi.spyOn(stripe.refunds, "create").mockResolvedValue({ id: "re_test_1" } as never);

    const result = await createRefundAction(order.id, { mode: "FULL", amount: "0", reason: "guest request" });

    expect(result.ok).toBe(true);
    const refund = await prisma.refund.findUniqueOrThrow({ where: { stripeRefundId: "re_test_1" } });
    expect(refund.paymentId).toBe(payment.id);
    expect(refund.status).toBe("PENDING"); // confirmed later by the charge.refunded webhook, not synchronously here
  });

  it("rejects a non-admin caller", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const user = await makeStaff("STAFF");
    setTestSession(sessionUserFromRow(user));
    const order = await makeOrder(business.id);

    await expect(createRefundAction(order.id, { mode: "FULL", amount: "0", reason: "x" })).rejects.toThrow();
  });
});
