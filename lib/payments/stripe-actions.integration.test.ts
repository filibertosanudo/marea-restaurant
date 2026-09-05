import { describe, it, expect, vi, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe/client";
import { createPaymentIntentAction } from "./stripe-actions";
import { makeBusiness, makeOrder } from "@/test/factories";
import { runConcurrently, partitionSettled } from "@/test/concurrency";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createPaymentIntentAction", () => {
  it("refuses when the business doesn't accept online payment", async () => {
    const business = await makeBusiness({ slug: "marea", acceptsOnlinePayment: false });
    const order = await makeOrder(business.id, { total: "23.19" });

    const result = await createPaymentIntentAction(order.publicToken);

    expect(result).toEqual({ ok: false, error: "online_payment_disabled" });
  });

  it("reports not_found for an unknown public token", async () => {
    await makeBusiness({ slug: "marea" });

    const result = await createPaymentIntentAction("not-a-real-token");

    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it("refuses a cancelled order", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const order = await makeOrder(business.id, { total: "23.19", status: "CANCELLED" });

    const result = await createPaymentIntentAction(order.publicToken);

    expect(result).toEqual({ ok: false, error: "order_cancelled" });
  });

  it("reports already_paid once the order is fully settled", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const order = await makeOrder(business.id, { total: "23.19" });
    await prisma.payment.create({
      data: { businessId: business.id, orderId: order.id, provider: "STRIPE", status: "SUCCEEDED", amount: "23.19" },
    });

    const result = await createPaymentIntentAction(order.publicToken);

    expect(result).toEqual({ ok: false, error: "already_paid" });
  });

  it("creates a fresh PaymentIntent and records a PENDING payment for it", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const order = await makeOrder(business.id, { total: "23.19" });
    vi.spyOn(stripe.paymentIntents, "create").mockResolvedValue({
      id: "pi_new",
      client_secret: "secret_new",
    } as never);

    const result = await createPaymentIntentAction(order.publicToken);

    expect(result).toEqual({ ok: true, clientSecret: "secret_new" });
    const payment = await prisma.payment.findUniqueOrThrow({ where: { stripePaymentIntentId: "pi_new" } });
    expect(payment.status).toBe("PENDING");
    expect(payment.amount.toString()).toBe("23.19");
  });

  it("reuses an existing open intent instead of creating a second one", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const order = await makeOrder(business.id, { total: "23.19" });
    await prisma.payment.create({
      data: {
        businessId: business.id,
        orderId: order.id,
        provider: "STRIPE",
        status: "PENDING",
        amount: "23.19",
        stripePaymentIntentId: "pi_existing",
      },
    });
    vi.spyOn(stripe.paymentIntents, "retrieve").mockResolvedValue({
      status: "requires_payment_method",
      amount: 2319,
      client_secret: "secret_existing",
    } as never);
    const createSpy = vi.spyOn(stripe.paymentIntents, "create");

    const result = await createPaymentIntentAction(order.publicToken);

    expect(result).toEqual({ ok: true, clientSecret: "secret_existing" });
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("updates the existing intent's amount when the order's total changed since it was created", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const order = await makeOrder(business.id, { total: "30.00" });
    const payment = await prisma.payment.create({
      data: {
        businessId: business.id,
        orderId: order.id,
        provider: "STRIPE",
        status: "PENDING",
        amount: "23.19",
        stripePaymentIntentId: "pi_stale_amount",
      },
    });
    vi.spyOn(stripe.paymentIntents, "retrieve").mockResolvedValue({
      status: "requires_payment_method",
      amount: 2319, // the stale amount — order.total is now 30.00
      client_secret: "secret_existing",
    } as never);
    vi.spyOn(stripe.paymentIntents, "update").mockResolvedValue({ client_secret: "secret_updated" } as never);

    const result = await createPaymentIntentAction(order.publicToken);

    expect(result).toEqual({ ok: true, clientSecret: "secret_updated" });
    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.amount.toString()).toBe("30");
  });

  it("reports try_again when updating the stale intent's amount fails", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const order = await makeOrder(business.id, { total: "30.00" });
    await prisma.payment.create({
      data: {
        businessId: business.id,
        orderId: order.id,
        provider: "STRIPE",
        status: "PENDING",
        amount: "23.19",
        stripePaymentIntentId: "pi_stale_amount_fails",
      },
    });
    vi.spyOn(stripe.paymentIntents, "retrieve").mockResolvedValue({
      status: "requires_payment_method",
      amount: 2319,
      client_secret: "secret_existing",
    } as never);
    vi.spyOn(stripe.paymentIntents, "update").mockRejectedValue(new Error("stripe is down"));

    const result = await createPaymentIntentAction(order.publicToken);

    expect(result).toEqual({ ok: false, error: "try_again" });
  });

  it("two concurrent calls sharing Stripe's idempotent response both succeed, only one Payment row is created", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const order = await makeOrder(business.id, { total: "23.19" });
    // Simulates Stripe's own idempotency key behavior: two concurrent
    // requests under the same key get back the same intent.
    vi.spyOn(stripe.paymentIntents, "create").mockResolvedValue({
      id: "pi_shared",
      client_secret: "secret_shared",
    } as never);

    const results = await runConcurrently([
      () => createPaymentIntentAction(order.publicToken),
      () => createPaymentIntentAction(order.publicToken),
    ]);
    const { fulfilled } = partitionSettled(results);

    expect(fulfilled).toHaveLength(2);
    expect(fulfilled.every((r) => r.ok)).toBe(true);
    const paymentCount = await prisma.payment.count({ where: { stripePaymentIntentId: "pi_shared" } });
    expect(paymentCount).toBe(1);
  });

  it("reports rate_limited once this IP's intent attempts exceed the cap", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const order = await makeOrder(business.id, { total: "23.19" });
    await prisma.rateLimitCounter.createMany({
      data: Array.from({ length: 10 }, () => ({ scope: "payment:intent", key: "unknown" })),
    });

    const result = await createPaymentIntentAction(order.publicToken);

    expect(result).toEqual({ ok: false, error: "rate_limited" });
  });
});
