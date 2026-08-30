import { toIntlLocale } from "@/lib/dto/money";
import type { Reservation, ReservationStatus, RestaurantTable } from "@/lib/generated/prisma/client";

/**
 * A reservation can only be cancelled by the guest while there's still
 * enough lead time for the business to actually do something with the
 * freed table — otherwise "cancel" just means "no-show, but announced two
 * minutes ahead". No rule in the module prompt pins an exact number, so
 * this is a business decision, not a derived constant; two hours is the
 * common floor real reservation systems use.
 */
export const MIN_CANCEL_LEAD_MINUTES = 120;

/**
 * The other half of the same lead-time question, at the opposite end of a
 * reservation's life: a slot that starts in the next few minutes isn't
 * bookable online either — the kitchen and the host stand need some
 * runway, and a restaurant that lets a guest book for "ten minutes from
 * now" while requiring two hours' notice to cancel has the asymmetry
 * backwards. Same caveat as MIN_CANCEL_LEAD_MINUTES: a business decision,
 * not a derived constant — thirty minutes is a reasonable default for
 * booking specifically, unrelated to cancellation's own two-hour figure.
 */
export const MIN_BOOKING_LEAD_MINUTES = 30;

const CANCELLABLE_STATUSES: ReservationStatus[] = ["PENDING", "CONFIRMED"];

/** Pure so it's trivial to reason about from the definition of done ("cancelarla si todavía falta tiempo suficiente") without spinning up a request. */
export function canCancelReservation(
  reservation: Pick<Reservation, "status" | "reservedFor">,
  now: Date
): boolean {
  if (!CANCELLABLE_STATUSES.includes(reservation.status)) return false;
  const minutesUntil = (reservation.reservedFor.getTime() - now.getTime()) / 60_000;
  return minutesUntil >= MIN_CANCEL_LEAD_MINUTES;
}

export type ReservationLookupDTO = {
  confirmationCode: string;
  guestName: string;
  partySize: number;
  /** Already formatted against the business's own timezone and the guest's locale — never a raw ISO string for a component to reparse. */
  reservedForLabel: string;
  status: ReservationStatus;
  tableLabel: string | null;
  notes: string | null;
  canCancel: boolean;
  cancellationReason: string | null;
};

type RawReservation = Reservation & { table: Pick<RestaurantTable, "code" | "zone"> | null };

export function toReservationLookupDTO(
  reservation: RawReservation,
  timezone: string,
  lang: string,
  now: Date
): ReservationLookupDTO {
  const reservedForLabel = new Intl.DateTimeFormat(toIntlLocale(lang), {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(reservation.reservedFor);

  return {
    confirmationCode: reservation.confirmationCode,
    guestName: reservation.guestName,
    partySize: reservation.partySize,
    reservedForLabel,
    status: reservation.status,
    tableLabel: reservation.table ? (reservation.table.zone ? `${reservation.table.zone} · ${reservation.table.code}` : reservation.table.code) : null,
    notes: reservation.notes,
    canCancel: canCancelReservation(reservation, now),
    cancellationReason: reservation.cancellationReason,
  };
}
