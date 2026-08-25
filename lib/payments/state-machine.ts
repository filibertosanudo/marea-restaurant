import { PaymentStatus } from "@/lib/generated/prisma/client";

/**
 * The one graph of legal Payment transitions, mirroring
 * lib/orders/state-machine.ts's role for Order. PENDING -> SUCCEEDED
 * covers cash-register collection (no Stripe intermediate step);
 * PENDING -> PROCESSING -> REQUIRES_ACTION -> SUCCEEDED covers a card.
 * REFUNDED/PARTIALLY_REFUNDED are terminal except the partial -> full case.
 */
const LEGAL_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING: ["PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED"],
  PROCESSING: ["REQUIRES_ACTION", "SUCCEEDED", "FAILED", "CANCELLED"],
  REQUIRES_ACTION: ["PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED"],
  SUCCEEDED: ["REFUNDED", "PARTIALLY_REFUNDED"],
  FAILED: [],
  CANCELLED: [],
  REFUNDED: [],
  PARTIALLY_REFUNDED: ["REFUNDED"],
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

export class IllegalPaymentTransitionError extends Error {
  constructor(from: PaymentStatus, to: PaymentStatus) {
    super(`Cannot transition payment from ${from} to ${to}`);
    this.name = "IllegalPaymentTransitionError";
  }
}

/** Throws IllegalPaymentTransitionError instead of silently applying a transition the graph above doesn't allow. */
export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransitionPayment(from, to)) {
    throw new IllegalPaymentTransitionError(from, to);
  }
}

/**
 * Every status that can still legally become CANCELLED — derived from the
 * graph above, not hand-listed, so a future edit to LEGAL_TRANSITIONS
 * can't silently desync from what order cancellation actually cancels.
 */
export const CANCELLABLE_PAYMENT_STATUSES: PaymentStatus[] = Object.values(PaymentStatus).filter((status) =>
  canTransitionPayment(status, "CANCELLED")
);
