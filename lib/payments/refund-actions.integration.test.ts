import { describe, it, expect, vi, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe/client";
import { createRefundAction } from "./refund-actions";
import { makeBusiness, makeOrder, makeStaff } from "@/test/factories";
import { setTestSession, sessionUserFromRow } from "@/test/stubs/auth-session";
import { runConcurrently, partitionSettled } from "@/test/concurrency";

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

  it("reports not_found for an unknown order", async () => {
    await makeBusiness({ slug: "marea" });
    await loginAsAdmin();

    const result = await createRefundAction("does-not-exist", { mode: "FULL", amount: "0", reason: "x" });

    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it("reports amount_exceeds_refundable for a blank partial amount", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const order = await makeOrder(business.id, { total: "23.19" });
    await prisma.payment.create({
      data: { businessId: business.id, orderId: order.id, provider: "CASH_REGISTER", status: "SUCCEEDED", amount: "23.19" },
    });

    const result = await createRefundAction(order.id, { mode: "PARTIAL", amount: "", reason: "blank amount" });

    expect(result).toEqual({ ok: false, error: "amount_exceeds_refundable" });
  });

  it("a second partial cash refund landing on an already-partially-refunded payment is a status no-op", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const order = await makeOrder(business.id, { total: "20.00" });
    const payment = await prisma.payment.create({
      data: {
        businessId: business.id,
        orderId: order.id,
        provider: "CASH_REGISTER",
        status: "PARTIALLY_REFUNDED",
        amount: "20.00",
      },
    });
    await prisma.refund.create({
      data: { paymentId: payment.id, amount: "5.00", currency: "MXN", status: "SUCCEEDED", reason: "first refund" },
    });

    const result = await createRefundAction(order.id, { mode: "PARTIAL", amount: "5.00", reason: "second partial" });

    expect(result.ok).toBe(true);
    const unchanged = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(unchanged.status).toBe("PARTIALLY_REFUNDED");
    const refunds = await prisma.refund.findMany({ where: { paymentId: payment.id } });
    expect(refunds).toHaveLength(2);
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

  it("refunds a partial amount within what's refundable", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const order = await makeOrder(business.id, { total: "23.19" });
    const payment = await prisma.payment.create({
      data: { businessId: business.id, orderId: order.id, provider: "CASH_REGISTER", status: "SUCCEEDED", amount: "23.19" },
    });

    const result = await createRefundAction(order.id, { mode: "PARTIAL", amount: "5.00", reason: "one item missing" });

    expect(result.ok).toBe(true);
    const refunds = await prisma.refund.findMany({ where: { paymentId: payment.id } });
    expect(refunds).toHaveLength(1);
    expect(refunds[0].amount.toString()).toBe("5");
    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.status).toBe("PARTIALLY_REFUNDED");
  });

  it("reports try_again when Stripe itself rejects the refund", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const order = await makeOrder(business.id, { total: "23.19" });
    await prisma.payment.create({
      data: {
        businessId: business.id,
        orderId: order.id,
        provider: "STRIPE",
        status: "SUCCEEDED",
        amount: "23.19",
        stripePaymentIntentId: "pi_refund_fails",
      },
    });
    vi.spyOn(stripe.refunds, "create").mockRejectedValue(new Error("stripe is down"));

    const result = await createRefundAction(order.id, { mode: "FULL", amount: "0", reason: "guest request" });

    expect(result).toEqual({ ok: false, error: "try_again" });
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

  it("reports try_again when recording the Stripe refund fails for a reason other than a duplicate", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const order = await makeOrder(business.id, { total: "23.19" });
    await prisma.payment.create({
      data: {
        businessId: business.id,
        orderId: order.id,
        provider: "STRIPE",
        status: "SUCCEEDED",
        amount: "23.19",
        stripePaymentIntentId: "pi_refund_row_fails",
      },
    });
    vi.spyOn(stripe.refunds, "create").mockResolvedValue({ id: "re_row_fails" } as never);
    const createSpy = vi.spyOn(prisma.refund, "create").mockRejectedValue(new Error("connection reset"));

    const result = await createRefundAction(order.id, { mode: "FULL", amount: "0", reason: "guest request" });

    expect(result).toEqual({ ok: false, error: "try_again" });
    createSpy.mockRestore();
  });

  it("rejects a non-admin caller", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const user = await makeStaff("STAFF");
    setTestSession(sessionUserFromRow(user));
    const order = await makeOrder(business.id);

    await expect(createRefundAction(order.id, { mode: "FULL", amount: "0", reason: "x" })).rejects.toThrow();
  });

  it("reports amount_exceeds_refundable for a non-numeric partial amount", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const order = await makeOrder(business.id, { total: "23.19" });
    await prisma.payment.create({
      data: { businessId: business.id, orderId: order.id, provider: "CASH_REGISTER", status: "SUCCEEDED", amount: "23.19" },
    });

    const result = await createRefundAction(order.id, { mode: "PARTIAL", amount: "not-a-number", reason: "typo'd amount" });

    expect(result).toEqual({ ok: false, error: "amount_exceeds_refundable" });
  });

  it("two concurrent full refunds on the same cash payment: exactly one succeeds, never both", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const order = await makeOrder(business.id, { total: "20.00" });
    const payment = await prisma.payment.create({
      data: { businessId: business.id, orderId: order.id, provider: "CASH_REGISTER", status: "SUCCEEDED", amount: "20.00" },
    });

    const results = await runConcurrently([
      () => createRefundAction(order.id, { mode: "FULL", amount: "0", reason: "guest complaint" }),
      () => createRefundAction(order.id, { mode: "FULL", amount: "0", reason: "guest complaint" }),
    ]);
    const { fulfilled } = partitionSettled(results);

    // Whichever call loses the race must report a clean error rather than
    // silently applying a second refund on top of the first — asserted
    // below via the actual row count, not just the result shape, since the
    // loser can observe the conflict from either of two honest places: its
    // own outer refundable-payments scan (nothing_refundable) or the
    // transaction-scoped recheck against the just-committed winner
    // (try_again) — both are the same safety guarantee, just caught at a
    // different point depending on exactly how the two calls interleave.
    expect(fulfilled).toHaveLength(2);
    const succeeded = fulfilled.filter((r) => r.ok);
    expect(succeeded).toHaveLength(1);
    const refunds = await prisma.refund.findMany({ where: { paymentId: payment.id } });
    expect(refunds).toHaveLength(1);
    expect(refunds[0].amount.toString()).toBe("20");
  });

  it("two concurrent Stripe refunds sharing the same idempotency key record only one Refund row", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const order = await makeOrder(business.id, { total: "20.00" });
    const payment = await prisma.payment.create({
      data: {
        businessId: business.id,
        orderId: order.id,
        provider: "STRIPE",
        status: "SUCCEEDED",
        amount: "20.00",
        stripePaymentIntentId: "pi_shared_refund",
      },
    });
    // Simulates Stripe's own idempotency key behavior: two concurrent
    // requests under the same key get back the same refund id.
    vi.spyOn(stripe.refunds, "create").mockResolvedValue({ id: "re_shared" } as never);

    const results = await runConcurrently([
      () => createRefundAction(order.id, { mode: "FULL", amount: "0", reason: "guest complaint" }),
      () => createRefundAction(order.id, { mode: "FULL", amount: "0", reason: "guest complaint" }),
    ]);
    const { fulfilled } = partitionSettled(results);

    expect(fulfilled).toHaveLength(2);
    expect(fulfilled.every((r) => r.ok)).toBe(true);
    const refundCount = await prisma.refund.count({ where: { paymentId: payment.id, stripeRefundId: "re_shared" } });
    expect(refundCount).toBe(1);
  });
});
