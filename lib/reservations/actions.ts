"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/business";
import type { Business } from "@/lib/generated/prisma/client";
import { getAvailableSlots, findSlot, localWallClockToUtc } from "./availability";
import {
  getOpeningHours,
  getBusinessClosures,
  getReservableTables,
  getReservationsOverlapping,
  getReservationByConfirmationCode,
} from "./queries";
import { reservationSlotsQuerySchema, createReservationSchema, parseDateParam } from "./schemas";
import { isExclusionConstraintError } from "./prisma-errors";
import { canCancelReservation } from "./dto";

const CANCELLATION_REASON_BY_LOCALE: Record<string, string> = {
  en: "Cancelled by the guest",
  es: "Cancelada por el cliente",
};

/**
 * Loads exactly what availability.ts needs for one calendar day and calls
 * it — the one place this happens, so the public slots list (this file) and
 * the create action below (which re-checks the guest's specific pick) can
 * never drift into two different definitions of "available". Takes the
 * already-resolved `business`, not a businessId, since both callers already
 * fetched it — calling getCurrentBusiness() a second time here would be a
 * redundant DB round-trip on every slot lookup and every booking attempt.
 */
async function loadAvailabilityForDay(business: Business, date: string, partySize: number, now: Date) {
  const dateParts = parseDateParam(date);

  const dayStart = localWallClockToUtc(dateParts.year, dateParts.month, dateParts.day, 0, business.timezone);
  // A close-after-midnight window (closesAt > 1440) can run into the next
  // calendar day, so the fetch window has to reach past this day's own
  // midnight — one extra day is more than any real opening hour needs.
  const dayEnd = localWallClockToUtc(dateParts.year, dateParts.month, dateParts.day, 2880, business.timezone);

  const [openingHours, closures, tables, existingReservations] = await Promise.all([
    getOpeningHours(business.id),
    getBusinessClosures(business.id),
    getReservableTables(business.id),
    getReservationsOverlapping(business.id, dayStart, dayEnd),
  ]);

  return {
    date: dateParts,
    partySize,
    durationMinutes: business.defaultReservationMinutes,
    maxPartySize: business.maxPartySize,
    timezone: business.timezone,
    openingHours,
    closures,
    tables,
    existingReservations,
    now,
  };
}

export type ReservationSlotsResult =
  | { ok: true; times: string[]; maxPartySize: number }
  | { ok: false; error: "invalid_input" };

/**
 * Called from the landing's reservation form whenever the guest picks a
 * date or changes the party size. Returns bare "HH:mm" strings, business-
 * local — the form paints exactly this list and never filters it further
 * (Fase 3's "ninguna disponibilidad se calcula dos veces" rule).
 */
export async function getReservationSlotsAction(date: string, partySize: number): Promise<ReservationSlotsResult> {
  const parsed = reservationSlotsQuerySchema.safeParse({ date, partySize });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const business = await getCurrentBusiness();
  const input = await loadAvailabilityForDay(business, parsed.data.date, parsed.data.partySize, new Date());
  const slots = getAvailableSlots(input);

  return { ok: true, times: slots.map((s) => s.time), maxPartySize: business.maxPartySize };
}

export type CreateReservationResult =
  | { ok: true; confirmationCode: string }
  | { ok: false; error: "invalid_input"; fieldErrors: Record<string, string> }
  | { ok: false; error: "slot_taken" };

/**
 * Reserving without an account, same as ordering without one: guestName is
 * required, and contact is "at least one of email or phone" — enforced in
 * createReservationSchema, not here, so the rule lives in one place.
 *
 * Re-runs the exact same availability check the slots list came from
 * (findSlot, not a hand-rolled second check) against fresh data, then lets
 * the EXCLUDE constraint have the last word: if a concurrent booking won
 * the race in the gap between this check and the INSERT, the constraint
 * violation is caught here and translated to the same slot_taken result a
 * guest sees when the pre-check itself fails — never a raw 500.
 */
export async function createReservationAction(input: {
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  partySize: number;
  date: string;
  time: string;
  notes?: string;
}): Promise<CreateReservationResult> {
  const parsed = createReservationSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] = issue.message;
    return { ok: false, error: "invalid_input", fieldErrors };
  }

  const business = await getCurrentBusiness();
  const availabilityInput = await loadAvailabilityForDay(business, parsed.data.date, parsed.data.partySize, new Date());
  const slot = findSlot(availabilityInput, parsed.data.time);
  if (!slot) return { ok: false, error: "slot_taken" };

  try {
    const reservation = await prisma.$transaction(async (tx) => {
      const created = await tx.reservation.create({
        data: {
          businessId: business.id,
          tableId: slot.tableId,
          guestName: parsed.data.guestName,
          guestEmail: parsed.data.guestEmail,
          guestPhone: parsed.data.guestPhone,
          partySize: parsed.data.partySize,
          reservedFor: slot.startsAt,
          durationMinutes: business.defaultReservationMinutes,
          endsAt: new Date(slot.startsAt.getTime() + business.defaultReservationMinutes * 60_000),
          notes: parsed.data.notes,
        },
      });

      if (created.guestEmail) {
        await tx.notificationJob.create({
          data: {
            businessId: business.id,
            channel: "EMAIL",
            templateKey: "reservation.confirmed",
            recipientEmail: created.guestEmail,
            locale: business.defaultLocale,
            payload: {
              confirmationCode: created.confirmationCode,
              reservedFor: created.reservedFor.toISOString(),
              partySize: created.partySize,
            },
            relatedReservationId: created.id,
            dedupeKey: `reservation:${created.id}:PENDING`,
          },
        });
      }

      return created;
    });

    return { ok: true, confirmationCode: reservation.confirmationCode };
  } catch (err) {
    if (isExclusionConstraintError(err)) return { ok: false, error: "slot_taken" };
    throw err;
  }
}

export type CancelReservationResult = { ok: true } | { ok: false; error: "not_found" | "too_late" };

/**
 * confirmationCode is this action's entire auth model, same as the lookup
 * page it's called from — collapses "no such reservation" and "found it,
 * but too close to cancel online" into results that never reveal more than
 * the page already showed the caller (canCancelReservation is what decided
 * whether the cancel button even rendered), so this can't be used as an
 * oracle to enumerate codes beyond what loading the page itself would take.
 */
export async function cancelReservationByCodeAction(confirmationCode: string): Promise<CancelReservationResult> {
  const business = await getCurrentBusiness();
  const reservation = await getReservationByConfirmationCode(business.id, confirmationCode);
  if (!reservation) return { ok: false, error: "not_found" };

  const now = new Date();
  if (!canCancelReservation(reservation, now)) return { ok: false, error: "too_late" };

  // Guarded by the status this action itself just read: staff could have
  // confirmed/seated/cancelled the same reservation in the gap between that
  // read and this write, in which case `count` comes back 0 and this must
  // not report success for a write that didn't happen.
  const result = await prisma.reservation.updateMany({
    where: { id: reservation.id, status: reservation.status },
    data: {
      status: "CANCELLED",
      cancelledAt: now,
      cancellationReason: CANCELLATION_REASON_BY_LOCALE[business.defaultLocale] ?? CANCELLATION_REASON_BY_LOCALE.es,
    },
  });

  return result.count > 0 ? { ok: true } : { ok: false, error: "too_late" };
}
