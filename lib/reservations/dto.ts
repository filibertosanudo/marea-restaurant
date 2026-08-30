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

function formatTableLabel(table: Pick<RestaurantTable, "code" | "zone"> | null): string | null {
  if (!table) return null;
  return table.zone ? `${table.zone} · ${table.code}` : table.code;
}

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
    tableLabel: formatTableLabel(reservation.table),
    notes: reservation.notes,
    canCancel: canCancelReservation(reservation, now),
    cancellationReason: reservation.cancellationReason,
  };
}

/** PENDING/CONFIRMED and already past its own start time — the row the agenda design specifically calls out: the one that decides whether it becomes a NO_SHOW, and the one an at-a-glance screen must not let blend into the rest. */
const OVERDUE_STATUSES: ReservationStatus[] = ["PENDING", "CONFIRMED"];

export function isReservationOverdue(reservation: Pick<Reservation, "status" | "reservedFor">, now: Date): boolean {
  return OVERDUE_STATUSES.includes(reservation.status) && reservation.reservedFor.getTime() < now.getTime();
}

export type AgendaReservationDTO = {
  id: string;
  guestName: string;
  partySize: number;
  /** "H:mm AM/PM", business-local — display only; the actual instant is `reservedFor` on the raw row, never re-derived from this string. */
  timeLabel: string;
  status: ReservationStatus;
  tableId: string | null;
  tableLabel: string | null;
  notes: string | null;
  isOverdue: boolean;
};

type RawAgendaReservation = Reservation & { table: Pick<RestaurantTable, "id" | "code" | "zone"> | null };

export function toAgendaReservationDTO(
  reservation: RawAgendaReservation,
  timezone: string,
  lang: string,
  now: Date
): AgendaReservationDTO {
  const timeLabel = new Intl.DateTimeFormat(toIntlLocale(lang), {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(reservation.reservedFor);

  return {
    id: reservation.id,
    guestName: reservation.guestName,
    partySize: reservation.partySize,
    timeLabel,
    status: reservation.status,
    tableId: reservation.tableId,
    tableLabel: formatTableLabel(reservation.table),
    notes: reservation.notes,
    isOverdue: isReservationOverdue(reservation, now),
  };
}

export type AgendaSummary = {
  total: number;
  pending: number;
  seated: number;
  overdue: number;
};

export function summarizeAgenda(reservations: Pick<AgendaReservationDTO, "status" | "isOverdue">[]): AgendaSummary {
  return reservations.reduce(
    (acc, r) => ({
      total: acc.total + 1,
      pending: acc.pending + (r.status === "PENDING" ? 1 : 0),
      seated: acc.seated + (r.status === "SEATED" ? 1 : 0),
      overdue: acc.overdue + (r.isOverdue ? 1 : 0),
    }),
    { total: 0, pending: 0, seated: 0, overdue: 0 }
  );
}
