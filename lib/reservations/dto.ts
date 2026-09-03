import { toIntlLocale } from "@/lib/dto/money";
import { CANCELLABLE_RESERVATION_STATUSES } from "./state-machine";
import type { Reservation, ReservationStatus, RestaurantTable } from "@/lib/generated/prisma/client";

/** Pure so it's trivial to reason about from the definition of done ("cancelarla si todavía falta tiempo suficiente") without spinning up a request. `minCancelLeadMinutes` comes from Business (Módulo 6, Fase 3) — a business decision, not something this function pins on its own. */
export function canCancelReservation(
  reservation: Pick<Reservation, "status" | "reservedFor">,
  now: Date,
  minCancelLeadMinutes: number
): boolean {
  if (!CANCELLABLE_RESERVATION_STATUSES.includes(reservation.status)) return false;
  const minutesUntil = (reservation.reservedFor.getTime() - now.getTime()) / 60_000;
  return minutesUntil >= minCancelLeadMinutes;
}

/** The six status labels every reservation-status dictionary carries — ReservationDictionary (guest-facing) and AdminDictionary["reservations"] (panel) each define these same key names, so one map serves both instead of each screen re-listing the same six pairs. */
export const RESERVATION_STATUS_LABEL_KEY: Record<
  ReservationStatus,
  "statusPending" | "statusConfirmed" | "statusSeated" | "statusCompleted" | "statusCancelled" | "statusNoShow"
> = {
  PENDING: "statusPending",
  CONFIRMED: "statusConfirmed",
  SEATED: "statusSeated",
  COMPLETED: "statusCompleted",
  CANCELLED: "statusCancelled",
  NO_SHOW: "statusNoShow",
};

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
  now: Date,
  minCancelLeadMinutes: number
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
    canCancel: canCancelReservation(reservation, now, minCancelLeadMinutes),
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
  /** The hour this slot falls in, as its own label ("12 PM") — a grouping key computed once here, so the client groups rows by hour without re-parsing timeLabel's localized string. */
  hourLabel: string;
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
  const locale = toIntlLocale(lang);
  const timeLabel = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(reservation.reservedFor);
  const hourLabel = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    hour: "numeric",
  }).format(reservation.reservedFor);

  return {
    id: reservation.id,
    guestName: reservation.guestName,
    partySize: reservation.partySize,
    timeLabel,
    hourLabel,
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
