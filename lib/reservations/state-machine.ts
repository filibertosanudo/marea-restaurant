import { ReservationStatus } from "@/lib/generated/prisma/client";

/**
 * The one graph of legal reservation-status transitions, same role for
 * Reservation that lib/orders/state-machine.ts and lib/payments/state-machine.ts
 * play for their own models. PENDING -> CONFIRMED is staff confirming;
 * CONFIRMED -> SEATED/NO_SHOW covers the two ways a confirmed table's
 * evening actually plays out; SEATED -> COMPLETED closes it out. CANCELLED
 * is reachable from PENDING or CONFIRMED (the two states a reservation can
 * still be taken away from) but not from SEATED — once someone's at the
 * table, "cancel" isn't the right verb for whatever happens next.
 *
 * PENDING -> NO_SHOW exists for the same reason CONFIRMED -> NO_SHOW does:
 * a guest who reserved and never showed didn't stop being a no-show just
 * because staff never got around to confirming them first. Without it, an
 * overdue PENDING row has no action a STAFF member (who can't cancel) can
 * actually take.
 */
const LEGAL_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED", "NO_SHOW"],
  CONFIRMED: ["SEATED", "NO_SHOW", "CANCELLED"],
  SEATED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function canTransitionReservation(from: ReservationStatus, to: ReservationStatus): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

/** Derived from the graph above, same as payments' CANCELLABLE_PAYMENT_STATUSES — so the agenda's Cancel button and dto.ts's canCancelReservation can't drift from a change to LEGAL_TRANSITIONS the way a hand-listed status set would. */
export const CANCELLABLE_RESERVATION_STATUSES: ReservationStatus[] = (
  Object.keys(LEGAL_TRANSITIONS) as ReservationStatus[]
).filter((status) => canTransitionReservation(status, "CANCELLED"));
