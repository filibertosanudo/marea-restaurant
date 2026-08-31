import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { OpeningHourWindow, ClosureWindow, ReservableTable, ExistingReservation } from "./availability";

/** Every opening-hour block the business has, across all seven days — a small table, always fetched whole. */
export async function getOpeningHours(businessId: string): Promise<OpeningHourWindow[]> {
  return prisma.openingHour.findMany({
    where: { businessId },
    select: { dayOfWeek: true, opensAt: true, closesAt: true, isClosed: true },
  });
}

/** Every closure the business has on the books — holidays and private events are rare enough that filtering by date here would save nothing worth the extra timezone math. */
export async function getBusinessClosures(businessId: string): Promise<ClosureWindow[]> {
  return prisma.businessClosure.findMany({
    where: { businessId },
    select: { startsAt: true, endsAt: true },
  });
}

/** Tables that can actually be reserved — active and not soft-deleted, same guard every other catalog query in this codebase uses. */
export async function getReservableTables(businessId: string): Promise<ReservableTable[]> {
  return prisma.restaurantTable.findMany({
    where: { businessId, isActive: true, deletedAt: null },
    select: { id: true, seats: true },
  });
}

/**
 * Every reservation whose range could possibly overlap [rangeStart, rangeEnd)
 * — a plain `reservedFor < rangeEnd AND endsAt > rangeStart` overlap query,
 * the same shape docs/DATABASE.md documents for this exact table. Includes
 * every status (not just the blocking ones) because availability.ts's own
 * BLOCKING_STATUSES filter is the single place that decides which statuses
 * hold a table — duplicating that filter into the query would be the two
 * places disagreeing eventually.
 *
 * Takes the Prisma client rather than importing the module-level one, so a
 * caller running inside a `$transaction` (staff-actions.ts's table
 * reassignment, which needs this to see its own row lock) can pass `tx`
 * instead of a second, transaction-blind copy of this query.
 */
export async function getReservationsOverlapping(
  client: Prisma.TransactionClient,
  businessId: string,
  rangeStart: Date,
  rangeEnd: Date
): Promise<ExistingReservation[]> {
  return client.reservation.findMany({
    where: { businessId, reservedFor: { lt: rangeEnd }, endsAt: { gt: rangeStart } },
    select: { id: true, tableId: true, reservedFor: true, endsAt: true, status: true },
  });
}

/**
 * The panel agenda's own definition of "business day": a fixed local
 * clock-time cutover, not a function of any OpeningHour row. A restaurant's
 * hours can be edited or deleted after a reservation was already booked
 * against them (this module's Fase 3 adds a screen for exactly that), and
 * a reservation that's already on the books must not disappear from its
 * own night — or jump to a different one — just because the catalog
 * changed. 6am is generous: well past any ordinary dinner service's
 * closes-after-midnight overflow, well before any ordinary opensAt.
 */
export const AGENDA_DAY_BOUNDARY_MINUTES = 360;

/**
 * Every reservation for one business day, in the shape the panel agenda
 * reads — ordered by time, the way the agenda is read, not by status the
 * way a kanban would group it. `dayStart` is this calendar day's own local
 * midnight (in UTC); the actual query window runs from AGENDA_DAY_BOUNDARY_MINUTES
 * past that to the same offset the next day, so a 1am reservation stays on
 * the night it started instead of appearing on tomorrow's agenda.
 */
export async function getAgendaReservationsRaw(businessId: string, dayStart: Date) {
  const windowStart = new Date(dayStart.getTime() + AGENDA_DAY_BOUNDARY_MINUTES * 60_000);
  const windowEnd = new Date(windowStart.getTime() + 24 * 60 * 60_000);
  return prisma.reservation.findMany({
    where: { businessId, reservedFor: { gte: windowStart, lt: windowEnd } },
    orderBy: { reservedFor: "asc" },
    include: { table: { select: { id: true, code: true, zone: true } } },
  });
}

/** Tables for the agenda's "reassign" picker — richer than getReservableTables (which only carries what availability.ts needs), since the UI has to show a human a code and a zone, not just an id. */
export async function getReservableTablesForAgenda(businessId: string) {
  return prisma.restaurantTable.findMany({
    where: { businessId, isActive: true, deletedAt: null },
    orderBy: [{ zone: "asc" }, { sortOrder: "asc" }],
    select: { id: true, code: true, zone: true, seats: true },
  });
}

/**
 * confirmationCode is this page's entire auth model, exactly like Order's
 * publicToken — resolve it scoped to the current business and nothing else,
 * so a caller can `notFound()` on a miss without ever learning whether the
 * code belongs to some other tenant.
 */
export async function getReservationByConfirmationCode(businessId: string, confirmationCode: string) {
  return prisma.reservation.findFirst({
    where: { businessId, confirmationCode },
    include: { table: { select: { code: true, zone: true } } },
  });
}
