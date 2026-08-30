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
 */
const LEGAL_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SEATED", "NO_SHOW", "CANCELLED"],
  SEATED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function canTransitionReservation(from: ReservationStatus, to: ReservationStatus): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

export class IllegalReservationTransitionError extends Error {
  constructor(from: ReservationStatus, to: ReservationStatus) {
    super(`Cannot transition reservation from ${from} to ${to}`);
    this.name = "IllegalReservationTransitionError";
  }
}

/** Throws IllegalReservationTransitionError instead of silently applying a transition the graph above doesn't allow. */
export function assertReservationTransition(from: ReservationStatus, to: ReservationStatus): void {
  if (!canTransitionReservation(from, to)) {
    throw new IllegalReservationTransitionError(from, to);
  }
}
