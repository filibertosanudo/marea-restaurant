import "server-only";
import { prisma } from "@/lib/prisma";
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
 */
export async function getReservationsOverlapping(
  businessId: string,
  rangeStart: Date,
  rangeEnd: Date
): Promise<ExistingReservation[]> {
  return prisma.reservation.findMany({
    where: { businessId, reservedFor: { lt: rangeEnd }, endsAt: { gt: rangeStart } },
    select: { tableId: true, reservedFor: true, endsAt: true, status: true },
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
