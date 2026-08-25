"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/permissions";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { getCurrentBusiness } from "@/lib/business";
import { getOrderPaymentDetailRaw } from "@/lib/orders/queries";
import { stripe } from "@/lib/stripe/client";
import { toStripeAmount } from "./amount";
import { refundableForPayment } from "./summary";
import { isUniqueConstraintError } from "./prisma-errors";
import { Prisma } from "@/lib/generated/prisma/client";

export type CreateRefundResult =
  | { ok: true }
  | {
      ok: false;
      error: "not_found" | "reason_required" | "nothing_refundable" | "amount_exceeds_refundable" | "try_again";
    };

/**
 * BUSINESS_ADMIN+ only, per the permission matrix — cancelling and
 * refunding are the two actions that move money back out, and both
 * require the admin threshold, not STAFF.
 *
 * Creates the Stripe refund, then the local Refund row at PENDING — never
 * SUCCEEDED from this synchronous response. The charge.refunded webhook
 * (already built in Fase 4) is what confirms it, upserting this same row
 * by stripeRefundId once Stripe's own confirmation lands.
 */
export async function createRefundAction(
  orderId: string,
  input: { mode: "FULL" | "PARTIAL"; amount: string; reason: string }
): Promise<CreateRefundResult> {
  const session = await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();

  const trimmedReason = input.reason.trim();
  if (!trimmedReason) return { ok: false, error: "reason_required" };

  const order = await getOrderPaymentDetailRaw(business.id, orderId);
  if (!order) return { ok: false, error: "not_found" };

  // A refund always targets one specific payment's own Stripe charge, not
  // an abstract order total — pick the most recent one with enough of its
  // own balance left to cover the request.
  const candidates = order.payments
    .map((payment) => ({ payment, refundable: refundableForPayment(payment) }))
    .filter(({ refundable }) => refundable.gt(0));
  if (candidates.length === 0) return { ok: false, error: "nothing_refundable" };

  // FULL always targets the single most recent refundable payment
  // (order.payments is createdAt-desc) — refunding a total split across
  // multiple payments in one request isn't supported; the common case
  // this app tests against is one settled payment per order.
  let requestedAmount: Prisma.Decimal;
  if (input.mode === "FULL") {
    requestedAmount = candidates[0].refundable;
  } else {
    try {
      requestedAmount = new Prisma.Decimal(input.amount || "0").toDecimalPlaces(2);
    } catch {
      return { ok: false, error: "amount_exceeds_refundable" };
    }
  }

  const target = candidates.find(({ refundable }) => refundable.gte(requestedAmount));
  if (!target || requestedAmount.lte(0) || !target.payment.stripePaymentIntentId) {
    return { ok: false, error: "amount_exceeds_refundable" };
  }

  // Deterministic from the request's own parameters (not a fresh id per
  // click) — an accidental double-submit of the exact same refund
  // collapses into one Stripe-side refund instead of two.
  const idempotencyKey = `refund_${target.payment.id}_${toStripeAmount(requestedAmount)}_${crypto
    .createHash("sha256")
    .update(trimmedReason)
    .digest("hex")
    .slice(0, 16)}`;

  let stripeRefund;
  try {
    stripeRefund = await stripe.refunds.create(
      {
        payment_intent: target.payment.stripePaymentIntentId,
        amount: toStripeAmount(requestedAmount),
        reason: "requested_by_customer",
        metadata: { orderId: order.id, staffId: session.user.id, staffReason: trimmedReason },
      },
      { idempotencyKey }
    );
  } catch {
    return { ok: false, error: "try_again" };
  }

  try {
    await prisma.refund.create({
      data: {
        paymentId: target.payment.id,
        amount: requestedAmount,
        currency: order.currency,
        status: "PENDING",
        reason: trimmedReason,
        stripeRefundId: stripeRefund.id,
        createdById: session.user.id,
      },
    });
  } catch (err) {
    // Same idempotency key already attached this Stripe refund to a
    // Refund row — that row is the record now, this one is a no-op.
    if (!isUniqueConstraintError(err)) throw err;
  }

  revalidatePath("/admin/pedidos");
  return { ok: true };
}
