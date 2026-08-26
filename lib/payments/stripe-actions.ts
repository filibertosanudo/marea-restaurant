"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/business";
import { getOrderForPaymentIntentByPublicToken } from "@/lib/orders/queries";
import { stripe } from "@/lib/stripe/client";
import { toStripeAmount } from "./amount";
import { computePaymentSummary } from "./summary";
import { isUniqueConstraintError } from "./prisma-errors";

export type CreatePaymentIntentResult =
  | { ok: true; clientSecret: string }
  | {
      ok: false;
      error: "not_found" | "order_cancelled" | "already_paid" | "online_payment_disabled" | "try_again";
    };

const OPEN_STRIPE_STATUSES = ["PENDING", "PROCESSING", "REQUIRES_ACTION"] as const;
// Stripe's own intent status, not this app's PaymentStatus — the states a
// PaymentIntent can still be confirmed from.
const CONFIRMABLE_INTENT_STATUSES = ["requires_payment_method", "requires_confirmation", "requires_action"];

/**
 * Called from the order-tracking page when a guest picks "pay with card".
 * Re-reads the order and its total from the DB — never trusts a client
 * amount. The idempotency key is derived from the order itself (not a
 * fresh id per click), so two overlapping submissions for the same order
 * resolve to the same PaymentIntent at Stripe instead of two charges.
 *
 * No rate limit: this is a public Server Action guarded only by knowing a
 * publicToken, but adding one the way lib/auth/rate-limit.ts does (a
 * dedicated Postgres table keyed by identity) would mean a schema change,
 * which this module doesn't authorize. The one concrete harm that absence
 * used to enable — a fixed idempotency key trapping a changed amount
 * behind Stripe's 24h window — is what keying it on the amount above
 * closes; every other effect of hammering this action is a harmless extra
 * PaymentIntent against an order it re-validates in full on every call.
 */
export async function createPaymentIntentAction(publicToken: string): Promise<CreatePaymentIntentResult> {
  const business = await getCurrentBusiness();
  if (!business.acceptsOnlinePayment) return { ok: false, error: "online_payment_disabled" };

  const order = await getOrderForPaymentIntentByPublicToken(business.id, publicToken);
  if (!order) return { ok: false, error: "not_found" };
  if (order.status === "CANCELLED") return { ok: false, error: "order_cancelled" };
  if (order.total.lte(0)) return { ok: false, error: "try_again" };

  const summary = computePaymentSummary(order.payments, order.total);
  if (summary.isSettled) return { ok: false, error: "already_paid" };

  // Reuse an already-open Stripe payment on this order (page reload, a
  // second render) instead of always round-tripping to Stripe — but only
  // if Stripe itself still considers it confirmable. Otherwise a guest
  // reload after the intent already succeeded (webhook not landed yet) or
  // got cancelled out-of-band (Dashboard) would hand back a client_secret
  // Stripe will reject on confirm.
  const openPayment = order.payments.find(
    (p) =>
      p.provider === "STRIPE" &&
      p.stripePaymentIntentId &&
      (OPEN_STRIPE_STATUSES as readonly string[]).includes(p.status)
  );
  const currentAmount = toStripeAmount(order.total);

  if (openPayment?.stripePaymentIntentId) {
    const existing = await stripe.paymentIntents.retrieve(openPayment.stripePaymentIntentId).catch(() => null);
    if (existing?.status === "succeeded") return { ok: false, error: "already_paid" };
    if (existing && CONFIRMABLE_INTENT_STATUSES.includes(existing.status) && existing.client_secret) {
      // The order's total can move between the guest opening this page and
      // confirming (a modifier's price changed, staff adjusted the order) —
      // reusing the intent's original amount would then charge a number
      // the order no longer agrees with. Bringing the intent up to date is
      // safe pre-confirmation (Stripe rejects the update once a payment
      // method has already been attached mid-confirm), and keeps this
      // order-derived idempotency key meaning "this order's current total"
      // rather than "whatever it was the first time".
      if (existing.amount !== currentAmount) {
        let updated;
        try {
          updated = await stripe.paymentIntents.update(existing.id, { amount: currentAmount });
        } catch {
          return { ok: false, error: "try_again" };
        }
        await prisma.payment.update({ where: { id: openPayment.id }, data: { amount: order.total } });
        if (!updated.client_secret) return { ok: false, error: "try_again" };
        return { ok: true, clientSecret: updated.client_secret };
      }
      return { ok: true, clientSecret: existing.client_secret };
    }
    // Anything else (canceled, retrieve failed) falls through to create —
    // Stripe's idempotency window means a truly dead intent under the
    // same order-derived key won't mint a fresh one for 24h; accepted as
    // a known, rare limitation rather than solved here.
  }

  let intent;
  try {
    intent = await stripe.paymentIntents.create(
      {
        amount: currentAmount,
        currency: order.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        metadata: { orderId: order.id, orderNumber: order.orderNumber, businessId: business.id },
      },
      // The amount is part of the key, not just the order id — otherwise a
      // total that changes between two calls (see above) would collide
      // with the first call's cached Stripe response under the same key
      // and stay stuck on the stale amount for the rest of Stripe's 24h
      // idempotency window, surfacing as a persistent try_again.
      { idempotencyKey: `pi_create_${order.id}_${currentAmount}` }
    );
  } catch {
    return { ok: false, error: "try_again" };
  }
  if (!intent.client_secret) return { ok: false, error: "try_again" };

  // Re-checked right here, after the Stripe round-trip — closes most of
  // the window between the read above and now. No row lock: cancelling
  // the just-created intent at Stripe is enough to make this safe without
  // holding a DB transaction open across an external API call.
  const freshOrder = await prisma.order.findUnique({ where: { id: order.id }, select: { status: true } });
  if (freshOrder?.status === "CANCELLED") {
    await stripe.paymentIntents.cancel(intent.id).catch(() => {});
    return { ok: false, error: "order_cancelled" };
  }

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
