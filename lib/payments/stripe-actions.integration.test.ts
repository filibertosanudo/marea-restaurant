import { describe, it, expect, vi, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe/client";
import { createPaymentIntentAction } from "./stripe-actions";
import { makeBusiness, makeOrder } from "@/test/factories";

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
});
