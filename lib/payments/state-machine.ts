import { PaymentStatus } from "@/lib/generated/prisma/client";

/**
 * The one graph of legal Payment transitions, mirroring
 * lib/orders/state-machine.ts's role for Order. PENDING -> SUCCEEDED
 * covers cash-register collection (no Stripe intermediate step);
 * PENDING -> PROCESSING -> REQUIRES_ACTION -> SUCCEEDED covers a card.
 * REFUNDED/PARTIALLY_REFUNDED are terminal except the partial -> full case.
 *
 * FAILED is deliberately not terminal: a declined card doesn't kill the
 * underlying Stripe PaymentIntent (it usually just goes back to
 * "requires a payment method"), and this app's own Retry button confirms
 * again against that same intent. Without SUCCEEDED/CANCELLED as legal
 * exits from FAILED, a guest who fails once and then succeeds on retry
 * would be genuinely charged while the webhook silently no-ops.
 */
const LEGAL_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING: ["PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED"],
  PROCESSING: ["REQUIRES_ACTION", "SUCCEEDED", "FAILED", "CANCELLED"],
  REQUIRES_ACTION: ["PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED"],
  FAILED: ["PROCESSING", "SUCCEEDED", "CANCELLED"],
  SUCCEEDED: ["REFUNDED", "PARTIALLY_REFUNDED"],
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
