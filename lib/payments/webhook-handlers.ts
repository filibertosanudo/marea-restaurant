import "server-only";
import type Stripe from "stripe";
import { Prisma } from "@/lib/generated/prisma/client";
import type { PaymentStatus } from "@/lib/generated/prisma/client";
import { stripe } from "@/lib/stripe/client";
import { canTransitionPayment } from "./state-machine";
import { cancelOtherOpenPaymentsIfSettled } from "./actions";

type TxClient = Prisma.TransactionClient;

export type ChargeDetails = {
  chargeId: string;
  brand: string | null;
  last4: string | null;
  receiptUrl: string | null;
};

/**
 * A Stripe API call, so it happens before the DB transaction starts — a
 * transaction should hold a connection for DB work only, never an
 * external network round-trip. Webhook event payloads carry `latest_charge`
 * as a bare id, not the expanded charge, so this is a real extra request.
 */
async function resolveChargeDetails(intent: Stripe.PaymentIntent): Promise<ChargeDetails | null> {
  const chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
  if (!chargeId) return null;

  const charge = await stripe.charges.retrieve(chargeId);
  return {
    chargeId: charge.id,
    brand: charge.payment_method_details?.card?.brand ?? null,
    last4: charge.payment_method_details?.card?.last4 ?? null,
    receiptUrl: charge.receipt_url ?? null,
  };
}

/**
 * Which events need Stripe API enrichment before the DB transaction opens —
 * a decision that belongs here (what each event needs to apply its effect),
 * not in the webhook route, which stays a thin parse/verify/transaction shell.
 */
export async function resolveChargeDetailsForEvent(event: Stripe.Event): Promise<ChargeDetails | null> {
  if (event.type === "payment_intent.succeeded") {
    return resolveChargeDetails(event.data.object as Stripe.PaymentIntent);
  }
  return null;
}

/**
 * `charge.refunded`'s own payload carries `refunds` as a bare, unexpanded
 * field since API version 2022-11-15 — Stripe's own SDK types it
 * `ApiList<Refund> | null` — and even expanded it caps at ten. Listing the
 * charge's refunds explicitly is the only way to see all of them, same
 * reasoning as resolveChargeDetails needing a real extra request for the
 * charge itself. Unlike that one, a failure here isn't swallowed to a
 * degraded-but-applied event: an unknown refund total is money this app
 * can't afford to silently miscount, so this throws and lets the webhook
 * fail loud (Stripe retries) instead of applying the event as if nothing
 * had been refunded.
 */
export async function resolveRefundsForEvent(event: Stripe.Event): Promise<Stripe.Refund[] | null> {
  if (event.type !== "charge.refunded") return null;
  const charge = event.data.object as Stripe.Charge;
  // .list() on its own still defaults to a page of 10 — the exact ceiling
  // this function exists to get past. autoPagingToArray walks every page.
  return stripe.refunds.list({ charge: charge.id }).autoPagingToArray({ limit: 10_000 });
}

/** A transition the graph rejects is worth a trace even though the handler still no-ops and responds 2xx — otherwise a real state mismatch (Stripe says paid, the DB disagrees) leaves zero record anywhere. */
function logRejectedTransition(event: string, paymentId: string, from: PaymentStatus, to: PaymentStatus): void {
  console.error(`[stripe webhook] ${event}: rejected ${from} -> ${to} for payment ${paymentId}`);
}

/**
 * The events this module handles. Every handler looks the Payment up by
 * stripePaymentIntentId/stripeChargeId and no-ops if it can't find one (an
 * event for an intent this app never created, or already fully applied) —
 * webhooks redeliver, so idempotent-by-lookup matters as much as the
 * StripeWebhookEvent row the caller inserts alongside this.
 */
export async function applyStripeEvent(
  tx: TxClient,
  event: Stripe.Event,
  chargeDetails: ChargeDetails | null,
  refunds: Stripe.Refund[] | null
): Promise<void> {
  switch (event.type) {
    case "payment_intent.succeeded":
      return handlePaymentIntentSucceeded(tx, event.data.object as Stripe.PaymentIntent, chargeDetails);
    case "payment_intent.processing":
      return handlePaymentIntentProcessing(tx, event.data.object as Stripe.PaymentIntent);
    case "payment_intent.requires_action":
      return handlePaymentIntentRequiresAction(tx, event.data.object as Stripe.PaymentIntent);
    case "payment_intent.payment_failed":
      return handlePaymentIntentFailed(tx, event.data.object as Stripe.PaymentIntent);
    case "payment_intent.canceled":
      return handlePaymentIntentCanceled(tx, event.data.object as Stripe.PaymentIntent);
    case "charge.refunded":
      return handleChargeRefunded(tx, event.data.object as Stripe.Charge, refunds ?? []);
    default:
      return;
  }
}

async function handlePaymentIntentSucceeded(
  tx: TxClient,
  intent: Stripe.PaymentIntent,
  charge: ChargeDetails | null
): Promise<void> {
  const payment = await tx.payment.findUnique({ where: { stripePaymentIntentId: intent.id } });
  if (!payment) return;
  if (!canTransitionPayment(payment.status, "SUCCEEDED")) {
    logRejectedTransition("payment_intent.succeeded", payment.id, payment.status, "SUCCEEDED");
    return;
  }

  await tx.payment.update({
    where: { id: payment.id },
    data: {
      status: "SUCCEEDED",
      paidAt: new Date(),
      stripeChargeId: charge?.chargeId ?? null,
      paymentMethodBrand: charge?.brand ?? null,
      paymentMethodLast4: charge?.last4 ?? null,
      receiptUrl: charge?.receiptUrl ?? null,
    },
  });
  await cancelOtherOpenPaymentsIfSettled(tx, payment.orderId, payment.id);
}

/**
 * Some payment methods Stripe offers under `automatic_payment_methods`
 * (bank debits, vouchers like OXXO) genuinely stay PROCESSING for minutes
 * to days, not just the instant between confirm and succeeded — until this
 * handled it, the DB had no way to ever show that instead of leaving the
 * order stuck on PENDING.
 */
async function handlePaymentIntentProcessing(tx: TxClient, intent: Stripe.PaymentIntent): Promise<void> {
  const payment = await tx.payment.findUnique({ where: { stripePaymentIntentId: intent.id } });
  if (!payment) return;
  if (!canTransitionPayment(payment.status, "PROCESSING")) {
    logRejectedTransition("payment_intent.processing", payment.id, payment.status, "PROCESSING");
    return;
  }

  await tx.payment.update({ where: { id: payment.id }, data: { status: "PROCESSING" } });
}

/** Mirrors handlePaymentIntentProcessing for a method that needs an out-of-band step this app's own confirm (redirect: "if_required") doesn't surface inline — a bank redirect, not the inline 3DS case Stripe already resolves before this event would ever fire. */
async function handlePaymentIntentRequiresAction(tx: TxClient, intent: Stripe.PaymentIntent): Promise<void> {
  const payment = await tx.payment.findUnique({ where: { stripePaymentIntentId: intent.id } });
  if (!payment) return;
  if (!canTransitionPayment(payment.status, "REQUIRES_ACTION")) {
    logRejectedTransition("payment_intent.requires_action", payment.id, payment.status, "REQUIRES_ACTION");
    return;
  }

  await tx.payment.update({ where: { id: payment.id }, data: { status: "REQUIRES_ACTION" } });
}

async function handlePaymentIntentFailed(tx: TxClient, intent: Stripe.PaymentIntent): Promise<void> {
  const payment = await tx.payment.findUnique({ where: { stripePaymentIntentId: intent.id } });
  if (!payment) return;
  if (!canTransitionPayment(payment.status, "FAILED")) {
    logRejectedTransition("payment_intent.payment_failed", payment.id, payment.status, "FAILED");
    return;
  }

  await tx.payment.update({
    where: { id: payment.id },
    data: {
      status: "FAILED",
      failureCode: intent.last_payment_error?.code ?? null,
      failureMessage: intent.last_payment_error?.message ?? null,
    },
  });
}

async function handlePaymentIntentCanceled(tx: TxClient, intent: Stripe.PaymentIntent): Promise<void> {
  const payment = await tx.payment.findUnique({ where: { stripePaymentIntentId: intent.id } });
  if (!payment) return;
  if (!canTransitionPayment(payment.status, "CANCELLED")) {
    logRejectedTransition("payment_intent.canceled", payment.id, payment.status, "CANCELLED");
    return;
  }

  await tx.payment.update({ where: { id: payment.id }, data: { status: "CANCELLED" } });
}

/**
 * Fires for a refund from anywhere — this app's own refund action (Fase 5)
 * or one issued straight from the Stripe Dashboard. Reconciles both the
 * Payment's own status and a Refund row per Stripe refund on the charge,
 * since the Dashboard case never went through this app's Refund.create.
 */
async function handleChargeRefunded(tx: TxClient, charge: Stripe.Charge, refunds: Stripe.Refund[]): Promise<void> {
  const paymentIntentId =
    typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) return;

  const payment = await tx.payment.findUnique({ where: { stripePaymentIntentId: paymentIntentId } });
  if (!payment) return;

  // The status update and the refund-row reconciliation are independent
  // facts — a blocked status transition (e.g. two refund events arrive
  // out of order and the later, larger one is processed first) must never
  // skip recording the refund itself. Money moved at Stripe regardless of
  // what this app's local status field ends up saying.
  const targetStatus: PaymentStatus = charge.amount_refunded >= charge.amount ? "REFUNDED" : "PARTIALLY_REFUNDED";
  if (payment.status !== targetStatus) {
    if (canTransitionPayment(payment.status, targetStatus)) {
      await tx.payment.update({ where: { id: payment.id }, data: { status: targetStatus } });
    } else {
      logRejectedTransition("charge.refunded", payment.id, payment.status, targetStatus);
    }
  }

  for (const refund of refunds) {
    await tx.refund.upsert({
      where: { stripeRefundId: refund.id },
      create: {
        paymentId: payment.id,
        amount: new Prisma.Decimal(refund.amount).div(100).toDecimalPlaces(2),
        currency: charge.currency.toUpperCase(),
        status: mapRefundStatus(refund.status),
        stripeRefundId: refund.id,
        processedAt: refund.status === "succeeded" ? new Date() : null,
      },
      update: {
        status: mapRefundStatus(refund.status),
        processedAt: refund.status === "succeeded" ? new Date() : null,
      },
    });
  }
}

function mapRefundStatus(status: Stripe.Refund["status"]): "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELLED" {
  if (status === "succeeded") return "SUCCEEDED";
  if (status === "failed") return "FAILED";
  if (status === "canceled") return "CANCELLED";
  return "PENDING";
}
