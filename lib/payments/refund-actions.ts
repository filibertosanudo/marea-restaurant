"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/permissions";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { getCurrentBusiness } from "@/lib/business";
import { getOrderPaymentDetailRaw } from "@/lib/orders/queries";
import { toOrderPaymentDetailDTO, type OrderPaymentDetailDTO } from "@/lib/orders/dto";
import { stripe } from "@/lib/stripe/client";
import { toStripeAmount } from "./amount";
import { refundableForPayment } from "./summary";
import { isUniqueConstraintError } from "./prisma-errors";
import { assertPaymentTransition } from "./state-machine";
import { Prisma, type Payment, type PaymentStatus, type Refund } from "@/lib/generated/prisma/client";

export type CreateRefundResult =
  | { ok: true; detail: OrderPaymentDetailDTO }
  | {
      ok: false;
      error: "not_found" | "reason_required" | "nothing_refundable" | "amount_exceeds_refundable" | "try_again";
    };

type Candidate = { payment: Payment & { refunds: Refund[] }; refundable: Prisma.Decimal };

/**
 * One Stripe refund + its local Refund row (PENDING — the charge.refunded
 * webhook from Fase 4 confirms it, never this synchronous response).
 *
 * The idempotency key is derived from how many refund attempts this
 * payment has already recorded (`payment.refunds.length`), not from the
 * amount/reason text — two concurrent double-clicks both read the same
 * count before either writes, so they collide on the same key exactly
 * when they should. A later, genuinely separate refund (even with the
 * identical amount and reason text an admin might reuse) sees one more
 * existing Refund row and gets a fresh key instead of Stripe silently
 * replaying the first refund's cached result.
 */
async function refundOnePayment(
  candidate: Candidate,
  amount: Prisma.Decimal,
  reason: string,
  staffId: string,
  orderId: string,
  currency: string
): Promise<void> {
  const idempotencyKey = `refund_${candidate.payment.id}_${candidate.payment.refunds.length}_${toStripeAmount(amount)}`;

  const stripeRefund = await stripe.refunds.create(
    {
      payment_intent: candidate.payment.stripePaymentIntentId ?? undefined,
      amount: toStripeAmount(amount),
      reason: "requested_by_customer",
      metadata: { orderId, staffId, staffReason: reason },
    },
    { idempotencyKey }
  );

  try {
    await prisma.refund.create({
      data: {
        paymentId: candidate.payment.id,
        amount,
        currency,
        status: "PENDING",
        reason,
        stripeRefundId: stripeRefund.id,
        createdById: staffId,
      },
    });
  } catch (err) {
    // Same idempotency key already attached this Stripe refund to a
    // Refund row — that row is the record now, this one is a no-op.
    if (!isUniqueConstraintError(err)) throw err;
  }
}

/**
 * A cash-register payment has no Stripe charge to refund against — the
 * money leaves the register, not an API call. Recorded as a real Refund row
 * (SUCCEEDED immediately, since no webhook will ever confirm it the way a
 * Stripe refund's would) so refundedTotal and the payment's own status
 * reflect it, instead of the admin seeing `ok: true` while nothing on
 * refundableTotal moved.
 *
 * Unlike refundOnePayment, there's no Stripe idempotency key to lean on for
 * safety against a double-click or two admins acting on the same payment at
 * once — so this locks the Payment row and re-reads its refund history
 * inside its own transaction instead of trusting the `candidate` snapshot
 * `createRefundAction` built before the loop started. A second, legitimate
 * partial refund landing on top of an already-PARTIALLY_REFUNDED payment
 * also can't move the status to that same value again (the transition graph
 * only allows PARTIALLY_REFUNDED -> REFUNDED), so that case is a status
 * no-op rather than a rejected transition — the Refund row still gets
 * written either way.
 */
async function refundCashPayment(
  candidate: Candidate,
  amount: Prisma.Decimal,
  reason: string,
  staffId: string,
  currency: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${candidate.payment.id} FOR UPDATE`;
    const fresh = await tx.payment.findUniqueOrThrow({
      where: { id: candidate.payment.id },
      include: { refunds: true },
    });
    const refundable = refundableForPayment(fresh);
    if (amount.gt(refundable)) {
      throw new Error("cash refund amount exceeds the payment's current refundable balance");
    }

    const targetStatus: PaymentStatus = amount.gte(refundable) ? "REFUNDED" : "PARTIALLY_REFUNDED";
    if (fresh.status !== targetStatus) {
      assertPaymentTransition(fresh.status, targetStatus);
    }

    await tx.refund.create({
      data: {
        paymentId: fresh.id,
        amount,
        currency,
        status: "SUCCEEDED",
        reason,
        createdById: staffId,
        processedAt: new Date(),
      },
    });
    if (fresh.status !== targetStatus) {
      await tx.payment.update({ where: { id: fresh.id }, data: { status: targetStatus } });
    }
  });
}

/** Routes to the Stripe or cash refund path by whether the payment has a Stripe intent — the one place that decision is made, instead of the FULL and PARTIAL branches below each re-deriving it. */
async function refundCandidate(
  candidate: Candidate,
  amount: Prisma.Decimal,
  reason: string,
  staffId: string,
  orderId: string,
  currency: string
): Promise<void> {
  if (candidate.payment.stripePaymentIntentId) {
    await refundOnePayment(candidate, amount, reason, staffId, orderId, currency);
  } else {
    await refundCashPayment(candidate, amount, reason, staffId, currency);
  }
}

/**
 * BUSINESS_ADMIN+ only, per the permission matrix — cancelling and
 * refunding are the two actions that move money back out, and both
 * require the admin threshold, not STAFF.
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
  // an abstract order total.
  const candidates: Candidate[] = order.payments
    .map((payment) => ({ payment, refundable: refundableForPayment(payment) }))
    .filter(({ refundable }) => refundable.gt(0));
  if (candidates.length === 0) return { ok: false, error: "nothing_refundable" };

  try {
    if (input.mode === "FULL") {
      // "Full" means everything left, which can span more than one
      // payment (a split cash+card order, or a failed attempt collected
      // in cash after a card retry also succeeded) — refund every
      // candidate's own balance, not just the first one.
      for (const candidate of candidates) {
        await refundCandidate(
          candidate,
          candidate.refundable,
          trimmedReason,
          session.user.id,
          order.id,
          order.currency
        );
      }
    } else {
      let requestedAmount: Prisma.Decimal;
      try {
        requestedAmount = new Prisma.Decimal(input.amount || "0").toDecimalPlaces(2);
      } catch {
        return { ok: false, error: "amount_exceeds_refundable" };
      }
      const target = candidates.find(({ refundable }) => refundable.gte(requestedAmount));
      if (!target || requestedAmount.lte(0)) {
        return { ok: false, error: "amount_exceeds_refundable" };
      }
      await refundCandidate(target, requestedAmount, trimmedReason, session.user.id, order.id, order.currency);
    }
  } catch {
    // Whatever refunds in a FULL-mode loop already succeeded at Stripe are
    // still recorded (each has its own Refund row by this point) — the
    // idempotency key makes retrying this same call safe, so surfacing
    // try_again here doesn't risk double-refunding the ones that landed.
    return { ok: false, error: "try_again" };
  }

  revalidatePath("/admin/pedidos");

  const refreshed = await getOrderPaymentDetailRaw(business.id, orderId);
  if (!refreshed) return { ok: false, error: "not_found" };
  return { ok: true, detail: toOrderPaymentDetailDTO(refreshed) };
}
