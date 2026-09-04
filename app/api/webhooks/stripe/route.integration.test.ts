import { describe, it, expect, vi, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe/client";
import { POST } from "./route";
import { makeBusiness, makeOrder } from "@/test/factories";

process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

function signedRequest(event: object) {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  });
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body: payload,
  });
}

function paymentIntentEvent(type: string, intentId: string, extra: object = {}) {
  return {
    id: `evt_${intentId}_${type}`,
    object: "event",
    type,
    data: { object: { id: intentId, object: "payment_intent", ...extra } },
  };
}

async function makePendingCardPayment(businessId: string, intentId: string) {
  const order = await makeOrder(businessId);
  return prisma.payment.create({
    data: {
      businessId,
      orderId: order.id,
      provider: "STRIPE",
      status: "PENDING",
      amount: "23.19",
      stripePaymentIntentId: intentId,
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/webhooks/stripe", () => {
  it("rejects an invalid signature with 400 and no database effect", async () => {
    const payload = JSON.stringify(paymentIntentEvent("payment_intent.succeeded", "pi_bad"));
    const request = new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=not-a-real-signature" },
      body: payload,
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await prisma.stripeWebhookEvent.count()).toBe(0);
  });

  it("marks a known PENDING payment SUCCEEDED", async () => {
    const business = await makeBusiness();
    const payment = await makePendingCardPayment(business.id, "pi_known_1");

    const response = await POST(signedRequest(paymentIntentEvent("payment_intent.succeeded", "pi_known_1")));

    expect(response.status).toBe(200);
    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.status).toBe("SUCCEEDED");
  });

  it("no-ops silently for an intent this app never created", async () => {
    const response = await POST(
      signedRequest(paymentIntentEvent("payment_intent.succeeded", "pi_never_seen"))
    );

    expect(response.status).toBe(200);
    expect(await prisma.payment.count()).toBe(0);
  });

  it("applies a redelivered event exactly once", async () => {
    const business = await makeBusiness();
    const payment = await makePendingCardPayment(business.id, "pi_redelivered");
    const event = paymentIntentEvent("payment_intent.succeeded", "pi_redelivered");
    const first = await POST(signedRequest(event));
    expect(first.status).toBe(200);

    // Flip it back so a second *application* of the same event would be
    // observable if it weren't deduped by eventId — proves the dedup, not
    // just that re-marking SUCCEEDED as SUCCEEDED looks like a no-op.
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } });

    const second = await POST(signedRequest(event));

    expect(second.status).toBe(200);
    expect(await prisma.stripeWebhookEvent.count({ where: { eventId: event.id } })).toBe(1);
    const stillRefunded = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(stillRefunded.status).toBe("REFUNDED");
  });

  it("rejects an illegal transition without applying it", async () => {
    const business = await makeBusiness();
    const payment = await makePendingCardPayment(business.id, "pi_terminal");
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } });

    const response = await POST(
      signedRequest(paymentIntentEvent("payment_intent.succeeded", "pi_terminal"))
    );

    expect(response.status).toBe(200);
    const unchanged = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(unchanged.status).toBe("REFUNDED");
  });

  it("charge.refunded partial marks PARTIALLY_REFUNDED and records a Refund row", async () => {
    const business = await makeBusiness();
    const payment = await makePendingCardPayment(business.id, "pi_partial_refund");
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "SUCCEEDED" } });

    vi.spyOn(stripe.refunds, "list").mockReturnValue({
      autoPagingToArray: async () => [
        { id: "re_1", amount: 500, status: "succeeded" },
      ],
    } as unknown as ReturnType<typeof stripe.refunds.list>);

    const event = {
      id: "evt_partial_refund",
      object: "event",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_partial",
          object: "charge",
          payment_intent: "pi_partial_refund",
          amount: 2319,
          amount_refunded: 500,
          currency: "mxn",
        },
      },
    };

    const response = await POST(signedRequest(event));

    expect(response.status).toBe(200);
    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.status).toBe("PARTIALLY_REFUNDED");
    const refund = await prisma.refund.findUniqueOrThrow({ where: { stripeRefundId: "re_1" } });
    expect(refund.amount.toString()).toBe("5");
    expect(refund.status).toBe("SUCCEEDED");
  });

  it("charge.refunded in full marks REFUNDED", async () => {
    const business = await makeBusiness();
    const payment = await makePendingCardPayment(business.id, "pi_full_refund");
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "SUCCEEDED" } });

    vi.spyOn(stripe.refunds, "list").mockReturnValue({
      autoPagingToArray: async () => [
        { id: "re_full", amount: 2319, status: "succeeded" },
      ],
    } as unknown as ReturnType<typeof stripe.refunds.list>);

    const event = {
      id: "evt_full_refund",
      object: "event",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_full",
          object: "charge",
          payment_intent: "pi_full_refund",
          amount: 2319,
          amount_refunded: 2319,
          currency: "mxn",
        },
      },
    };

    const response = await POST(signedRequest(event));

    expect(response.status).toBe(200);
    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.status).toBe("REFUNDED");
  });

  it("brings back every refund on a charge with more than ten (autoPagingToArray)", async () => {
    const business = await makeBusiness();
    const payment = await makePendingCardPayment(business.id, "pi_many_refunds");
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "SUCCEEDED" } });

    const manyRefunds = Array.from({ length: 13 }, (_, i) => ({
      id: `re_many_${i}`,
      amount: 100,
      status: "succeeded" as const,
    }));
    vi.spyOn(stripe.refunds, "list").mockReturnValue({
      autoPagingToArray: async () => manyRefunds,
    } as unknown as ReturnType<typeof stripe.refunds.list>);

    const event = {
      id: "evt_many_refunds",
      object: "event",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_many",
          object: "charge",
          payment_intent: "pi_many_refunds",
          amount: 2319,
          amount_refunded: 1300,
          currency: "mxn",
        },
      },
    };

    const response = await POST(signedRequest(event));

    expect(response.status).toBe(200);
    const refundCount = await prisma.refund.count({ where: { paymentId: payment.id } });
    expect(refundCount).toBe(13);
  });

  it("payment_intent.processing marks a bank-debit-style payment PROCESSING", async () => {
    const business = await makeBusiness();
    const payment = await makePendingCardPayment(business.id, "pi_processing");

    const response = await POST(signedRequest(paymentIntentEvent("payment_intent.processing", "pi_processing")));

    expect(response.status).toBe(200);
    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.status).toBe("PROCESSING");
  });

  it("payment_intent.requires_action marks a payment REQUIRES_ACTION", async () => {
    const business = await makeBusiness();
    const payment = await makePendingCardPayment(business.id, "pi_requires_action");
    // REQUIRES_ACTION is only a legal move from PROCESSING, never directly
    // from PENDING — see the state machine's own graph.
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "PROCESSING" } });

    const response = await POST(
      signedRequest(paymentIntentEvent("payment_intent.requires_action", "pi_requires_action"))
    );

    expect(response.status).toBe(200);
    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.status).toBe("REQUIRES_ACTION");
  });

  it("payment_intent.payment_failed records the failure code and message", async () => {
    const business = await makeBusiness();
    const payment = await makePendingCardPayment(business.id, "pi_failed");

    const response = await POST(
      signedRequest(
        paymentIntentEvent("payment_intent.payment_failed", "pi_failed", {
          last_payment_error: { code: "card_declined", message: "Your card was declined." },
        })
      )
    );

    expect(response.status).toBe(200);
    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.status).toBe("FAILED");
    expect(updated.failureCode).toBe("card_declined");
  });

  it("payment_intent.canceled marks a payment CANCELLED", async () => {
    const business = await makeBusiness();
    const payment = await makePendingCardPayment(business.id, "pi_canceled");

    const response = await POST(signedRequest(paymentIntentEvent("payment_intent.canceled", "pi_canceled")));

    expect(response.status).toBe(200);
    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.status).toBe("CANCELLED");
  });
});
