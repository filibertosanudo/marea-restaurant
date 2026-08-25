"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/business";
import { stripe } from "@/lib/stripe/client";
import { toStripeAmount } from "./amount";
import { computePaymentSummary } from "./summary";
import { isUniqueConstraintError } from "./prisma-errors";

export type CreatePaymentIntentResult =
  | { ok: true; clientSecret: string }
  | { ok: false; error: "not_found" | "order_cancelled" | "already_paid" | "try_again" };

const OPEN_STRIPE_STATUSES = ["PENDING", "PROCESSING", "REQUIRES_ACTION"] as const;

/**
 * Called from the order-tracking page when a guest picks "pay with card".
 * Re-reads the order and its total from the DB — never trusts a client
 * amount. The idempotency key is derived from the order itself (not a
 * fresh id per click), so two overlapping submissions for the same order
 * resolve to the same PaymentIntent at Stripe instead of two charges.
 */
export async function createPaymentIntentAction(publicToken: string): Promise<CreatePaymentIntentResult> {
  const business = await getCurrentBusiness();

  const order = await prisma.order.findFirst({
    where: { businessId: business.id, publicToken },
    include: { payments: { orderBy: { createdAt: "desc" }, include: { refunds: true } } },
  });
  if (!order) return { ok: false, error: "not_found" };
  if (order.status === "CANCELLED") return { ok: false, error: "order_cancelled" };

  const summary = computePaymentSummary(order.payments, order.total);
  if (summary.isSettled) return { ok: false, error: "already_paid" };

  // Reuse an already-open Stripe payment on this order (page reload, a
  // second render) instead of always round-tripping to Stripe.
  const openPayment = order.payments.find(
    (p) =>
      p.provider === "STRIPE" &&
      p.stripePaymentIntentId &&
      (OPEN_STRIPE_STATUSES as readonly string[]).includes(p.status)
  );
  if (openPayment?.stripePaymentIntentId) {
    const existing = await stripe.paymentIntents.retrieve(openPayment.stripePaymentIntentId);
    if (existing.client_secret) return { ok: true, clientSecret: existing.client_secret };
  }

  let intent;
  try {
    intent = await stripe.paymentIntents.create(
      {
        amount: toStripeAmount(order.total),
        currency: order.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        metadata: { orderId: order.id, orderNumber: order.orderNumber, businessId: business.id },
      },
      { idempotencyKey: `pi_create_${order.id}` }
    );
  } catch {
    return { ok: false, error: "try_again" };
  }
  if (!intent.client_secret) return { ok: false, error: "try_again" };

  try {
    await prisma.payment.create({
      data: {
        businessId: business.id,
        orderId: order.id,
        provider: "STRIPE",
        status: "PENDING",
        amount: order.total,
        currency: order.currency,
        stripePaymentIntentId: intent.id,
      },
    });
  } catch (err) {
    // A concurrent call with the same idempotency key already attached
    // this same intent to a payment row — that row is the record now,
    // this one is a harmless no-op.
    if (!isUniqueConstraintError(err)) throw err;
  }

  return { ok: true, clientSecret: intent.client_secret };
}
