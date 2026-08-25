import "server-only";
import type Stripe from "stripe";
import { Prisma } from "@/lib/generated/prisma/client";
import type { PaymentStatus } from "@/lib/generated/prisma/client";
import { stripe } from "@/lib/stripe/client";
import { canTransitionPayment } from "./state-machine";

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
export async function resolveChargeDetails(intent: Stripe.PaymentIntent): Promise<ChargeDetails | null> {
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
 * The four events Fase 4 handles. Every handler looks the Payment up by
 * stripePaymentIntentId/stripeChargeId and no-ops if it can't find one (an
 * event for an intent this app never created, or already fully applied) —
 * webhooks redeliver, so idempotent-by-lookup matters as much as the
 * StripeWebhookEvent row the caller inserts alongside this.
 */
export async function applyStripeEvent(
  tx: TxClient,
  event: Stripe.Event,
  chargeDetails: ChargeDetails | null
): Promise<void> {
  switch (event.type) {
    case "payment_intent.succeeded":
      return handlePaymentIntentSucceeded(tx, event.data.object as Stripe.PaymentIntent, chargeDetails);
    case "payment_intent.payment_failed":
      return handlePaymentIntentFailed(tx, event.data.object as Stripe.PaymentIntent);
    case "payment_intent.canceled":
      return handlePaymentIntentCanceled(tx, event.data.object as Stripe.PaymentIntent);
    case "charge.refunded":
      return handleChargeRefunded(tx, event.data.object as Stripe.Charge);
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
  if (!payment || !canTransitionPayment(payment.status, "SUCCEEDED")) return;

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
}

async function handlePaymentIntentFailed(tx: TxClient, intent: Stripe.PaymentIntent): Promise<void> {
  const payment = await tx.payment.findUnique({ where: { stripePaymentIntentId: intent.id } });
  if (!payment || !canTransitionPayment(payment.status, "FAILED")) return;

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
  if (!payment || !canTransitionPayment(payment.status, "CANCELLED")) return;

  await tx.payment.update({ where: { id: payment.id }, data: { status: "CANCELLED" } });
}

/**
 * Fires for a refund from anywhere — this app's own refund action (Fase 5)
 * or one issued straight from the Stripe Dashboard. Reconciles both the
 * Payment's own status and a Refund row per Stripe refund on the charge,
 * since the Dashboard case never went through this app's Refund.create.
 */
async function handleChargeRefunded(tx: TxClient, charge: Stripe.Charge): Promise<void> {
  const paymentIntentId =
    typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) return;

  const payment = await tx.payment.findUnique({ where: { stripePaymentIntentId: paymentIntentId } });
  if (!payment) return;

  const targetStatus: PaymentStatus = charge.amount_refunded >= charge.amount ? "REFUNDED" : "PARTIALLY_REFUNDED";
  if (payment.status !== targetStatus) {
    if (!canTransitionPayment(payment.status, targetStatus)) return;
    await tx.payment.update({ where: { id: payment.id }, data: { status: targetStatus } });
  }

  for (const refund of charge.refunds?.data ?? []) {
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
