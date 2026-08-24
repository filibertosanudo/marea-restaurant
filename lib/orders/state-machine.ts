import type { OrderStatus } from "@/lib/generated/prisma/client";

/**
 * The one graph of legal order-status transitions, shared by the kitchen
 * board and the waiter view (they're the same page, different layout) so
 * "what can happen next" is never defined twice. Cancelling is a separate
 * concern from advancing — see isCancellable — because who's allowed to do
 * it differs (STAFF advances, only BUSINESS_ADMIN+ cancels), not because the
 * graph itself is different.
 */
const NEXT_STATUS: Record<OrderStatus, OrderStatus | null> = {
  PENDING: "PREPARING",
  PREPARING: "READY",
  READY: "DELIVERED",
  DELIVERED: null,
  CANCELLED: null,
};

const CANCELLABLE_FROM: OrderStatus[] = ["PENDING", "PREPARING", "READY"];

/** The single "advance" step the board's one-tap button performs, or null if the order is already at a terminal status. */
export function getNextStatus(current: OrderStatus): OrderStatus | null {
  return NEXT_STATUS[current];
}

/** General edge check — used to reject anything that isn't the one legal forward step (no skipping PENDING -> READY, no going back from DELIVERED). */
export function canAdvanceTo(current: OrderStatus, target: OrderStatus): boolean {
  return NEXT_STATUS[current] === target;
}

export function isCancellable(current: OrderStatus): boolean {
  return CANCELLABLE_FROM.includes(current);
}

export type BoardColumnStatus = "PENDING" | "PREPARING" | "READY" | "DELIVERED";

export const BOARD_COLUMNS: { status: BoardColumnStatus }[] = [
  { status: "PENDING" },
  { status: "PREPARING" },
  { status: "READY" },
  { status: "DELIVERED" },
];
