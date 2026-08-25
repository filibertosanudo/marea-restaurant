import "server-only";
import type { Prisma, PaymentStatus } from "@/lib/generated/prisma/client";
import { assertPaymentTransition } from "./state-machine";

type TxClient = Prisma.TransactionClient;

/** Cancels every PENDING payment for an order — called inside cancelOrderAction's own transaction (finding 1.1). */
export async function cancelPendingPayments(tx: TxClient, orderId: string): Promise<void> {
  await tx.payment.updateMany({
    where: { orderId, status: "PENDING" },
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
