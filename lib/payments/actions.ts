import "server-only";
import type { Prisma, PaymentStatus } from "@/lib/generated/prisma/client";
import { assertPaymentTransition, CANCELLABLE_PAYMENT_STATUSES } from "./state-machine";
import { computePaymentSummary } from "./summary";

type TxClient = Prisma.TransactionClient;

/** Cancels every still-open payment for an order (PENDING, and anything mid-flight — PROCESSING, REQUIRES_ACTION), called when the order itself is cancelled. */
export async function cancelOpenPayments(tx: TxClient, orderId: string): Promise<void> {
  await tx.payment.updateMany({
    where: { orderId, status: { in: CANCELLABLE_PAYMENT_STATUSES } },
    data: { status: "CANCELLED" },
  });
}

/**
 * The other half of closing the double-charge hole: once a payment succeeds
 * and that alone covers the order (cash after a card already went through,
 * or vice versa), every other still-open payment on the order is stale —
 * left PENDING, it's exactly what a second "Cobrar" tap or a delayed
 * webhook would collect again. Cancels by order total, not by counting
 * payments, since a split cash+card order can still have a third open
 * attempt that's genuinely no longer needed once the first two cover it.
 */
export async function cancelOtherOpenPaymentsIfSettled(
  tx: TxClient,
  orderId: string,
  keepPaymentId: string
): Promise<void> {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      total: true,
      payments: { select: { status: true, amount: true, refunds: { select: { status: true, amount: true } } } },
    },
  });
  if (!computePaymentSummary(order.payments, order.total).isSettled) return;

  await tx.payment.updateMany({
    where: { orderId, id: { not: keepPaymentId }, status: { in: CANCELLABLE_PAYMENT_STATUSES } },
    data: { status: "CANCELLED" },
  });
}

/** Marks a payment SUCCEEDED — the cash-register collection path. Validates the transition first, never applies it silently, and closes out any other open payment the order no longer needs. */
export async function markPaymentSucceeded(
  tx: TxClient,
  payment: { id: string; status: PaymentStatus; orderId: string },
  collectedByUserId: string
): Promise<void> {
  assertPaymentTransition(payment.status, "SUCCEEDED");
  await tx.payment.update({
    where: { id: payment.id },
    data: { status: "SUCCEEDED", paidAt: new Date(), collectedByUserId },
  });
  await cancelOtherOpenPaymentsIfSettled(tx, payment.orderId, payment.id);
}
