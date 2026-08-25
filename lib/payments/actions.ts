import "server-only";
import type { Prisma, PaymentStatus } from "@/lib/generated/prisma/client";
import { assertPaymentTransition, CANCELLABLE_PAYMENT_STATUSES } from "./state-machine";

type TxClient = Prisma.TransactionClient;

/** Cancels every still-open payment for an order (PENDING, and anything mid-flight — PROCESSING, REQUIRES_ACTION), called when the order itself is cancelled. */
export async function cancelOpenPayments(tx: TxClient, orderId: string): Promise<void> {
  await tx.payment.updateMany({
    where: { orderId, status: { in: CANCELLABLE_PAYMENT_STATUSES } },
    data: { status: "CANCELLED" },
  });
}

/** Marks a payment SUCCEEDED — the cash-register collection path. Validates the transition first, never applies it silently. */
export async function markPaymentSucceeded(
  tx: TxClient,
  payment: { id: string; status: PaymentStatus },
  collectedByUserId: string
): Promise<void> {
  assertPaymentTransition(payment.status, "SUCCEEDED");
  await tx.payment.update({
    where: { id: payment.id },
    data: { status: "SUCCEEDED", paidAt: new Date(), collectedByUserId },
  });
}
