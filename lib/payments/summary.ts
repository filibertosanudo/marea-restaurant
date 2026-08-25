import { Prisma } from "@/lib/generated/prisma/client";
import type { Payment, Refund } from "@/lib/generated/prisma/client";

/**
 * "Lo pagado" is the sum of SUCCEEDED payments, never a single payment's
 * status — an order can have a failed attempt and a succeeded retry, or a
 * split payment across two cards. Any UI that reads "is this order paid"
 * goes through this, not order.payments[0].
 */
export function sumSucceededPayments(payments: Pick<Payment, "status" | "amount">[]): Prisma.Decimal {
  return payments
    .filter((p) => p.status === "SUCCEEDED")
    .reduce((sum, p) => sum.add(p.amount), new Prisma.Decimal(0));
}

/** Same rule for refunds: only SUCCEEDED ones actually moved money back. */
export function sumSucceededRefunds(refunds: Pick<Refund, "status" | "amount">[]): Prisma.Decimal {
  return refunds
    .filter((r) => r.status === "SUCCEEDED")
    .reduce((sum, r) => sum.add(r.amount), new Prisma.Decimal(0));
}

export type PaymentSummary = {
  paidTotal: Prisma.Decimal;
  refundedTotal: Prisma.Decimal;
  /** paidTotal - refundedTotal, floored at 0 — the most a new refund can be for. */
  refundableTotal: Prisma.Decimal;
  /** Sum of SUCCEEDED payments minus refunds covers the order total. */
  isSettled: boolean;
};

export function computePaymentSummary(
  payments: (Pick<Payment, "status" | "amount"> & { refunds: Pick<Refund, "status" | "amount">[] })[],
  orderTotal: Prisma.Decimal
): PaymentSummary {
  const paidTotal = sumSucceededPayments(payments);
  const refundedTotal = sumSucceededRefunds(payments.flatMap((p) => p.refunds));
  const net = paidTotal.sub(refundedTotal);
  const refundableTotal = net.lte(0) ? new Prisma.Decimal(0) : net;

  return {
    paidTotal,
    refundedTotal,
    refundableTotal,
    isSettled: net.gte(orderTotal),
  };
}
