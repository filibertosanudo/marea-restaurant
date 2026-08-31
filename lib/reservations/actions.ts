"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/business";
import type { Business } from "@/lib/generated/prisma/client";
import { getClientIp, isScopeRateLimited, recordScopeAttempt } from "@/lib/auth/rate-limit";
import { getAvailableSlots, findSlot, localWallClockToUtc } from "./availability";
import {
  getOpeningHours,
  getBusinessClosures,
  getReservableTables,
  getReservationsOverlapping,
  getReservationByConfirmationCode,
} from "./queries";
import { reservationSlotsQuerySchema, createReservationSchema, parseDateParam, isWithinBookingHorizon } from "./schemas";
import { isExclusionConstraintError } from "./prisma-errors";
import { canCancelReservation, MIN_BOOKING_LEAD_MINUTES } from "./dto";

const CANCELLATION_REASON_BY_LOCALE: Record<string, string> = {
  en: "Cancelled by the guest",
  es: "Cancelada por el cliente",
};

// Creating a reservation is the one action here with no auth at all beyond
// "you filled out a form" — five per hour is more than any real party or
// family books in one sitting, and is exactly the volume that would fill a
// Friday night with fake covers in minutes.
const CREATE_SCOPE = "reservation:create";
const CREATE_MAX_ATTEMPTS = 5;
const CREATE_WINDOW_MS = 60 * 60 * 1000;

// Guessing surface — confirmationCode is toda la autenticación for viewing
// and cancelling. cuid(2)'s search space already makes brute-forcing
// impractical, but a rate limit doesn't get to depend on the token being
// long; reuses login's own per-IP tolerance (20 / 15 min) since this is the
// same class of guessing attempt, not a fresh number invented for this case.
const CANCEL_SCOPE = "reservation:cancel";

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
    getReservationsOverlapping(prisma, business.id, dayStart, dayEnd),
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
    minLeadMinutes: MIN_BOOKING_LEAD_MINUTES,
  };
}

export type ReservationSlotsResult =
  | { ok: true; slots: number[]; maxPartySize: number }
  | { ok: false; error: "invalid_input" };

/**
 * Called from the landing's reservation form whenever the guest picks a
 * date or changes the party size. Returns each slot's raw minutesFromMidnight
 * — never a "HH:mm" string, which a close-after-midnight window could
 * produce twice for two genuinely different instants (see availability.ts's
 * own doc comment on AvailableSlot) — business-local. The form paints
 * exactly this list and never filters it further (Fase 3's "ninguna
 * disponibilidad se calcula dos veces" rule); labelling for display is the
 * client's job, done from this same unreduced number.
 */
export async function getReservationSlotsAction(date: string, partySize: number): Promise<ReservationSlotsResult> {
  const parsed = reservationSlotsQuerySchema.safeParse({ date, partySize });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const business = await getCurrentBusiness();
  const now = new Date();
  if (!isWithinBookingHorizon(parseDateParam(parsed.data.date), now, business.timezone)) {
    return { ok: false, error: "invalid_input" };
  }

  const input = await loadAvailabilityForDay(business, parsed.data.date, parsed.data.partySize, now);
  const slots = getAvailableSlots(input);

  return { ok: true, slots: slots.map((s) => s.minutesFromMidnight), maxPartySize: business.maxPartySize };
}

export type CreateReservationResult =
  | { ok: true; confirmationCode: string }
  | { ok: false; error: "invalid_input"; fieldErrors: Record<string, string> }
  | { ok: false; error: "slot_taken" }
  | { ok: false; error: "rate_limited" };

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
  /** Minutes since the requested day's local midnight — the exact value getReservationSlotsAction listed, never a re-derived "HH:mm" string. */
  time: number;
  notes?: string;
}): Promise<CreateReservationResult> {
  const parsed = createReservationSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] = issue.message;
    return { ok: false, error: "invalid_input", fieldErrors };
  }

  const ip = getClientIp(await headers());
  if (await isScopeRateLimited(CREATE_SCOPE, ip, CREATE_MAX_ATTEMPTS, CREATE_WINDOW_MS)) {
    return { ok: false, error: "rate_limited" };
  }

  const business = await getCurrentBusiness();
  const now = new Date();
  if (!isWithinBookingHorizon(parseDateParam(parsed.data.date), now, business.timezone)) {
    return { ok: false, error: "invalid_input", fieldErrors: { date: "too_far_ahead" } };
  }

  const availabilityInput = await loadAvailabilityForDay(business, parsed.data.date, parsed.data.partySize, now);
  const slot = findSlot(availabilityInput, parsed.data.time);
  if (!slot) return { ok: false, error: "slot_taken" };

  let reservation;
  try {
    reservation = await prisma.$transaction(async (tx) => {
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
  } catch (err) {
    if (isExclusionConstraintError(err)) return { ok: false, error: "slot_taken" };
    throw err;
  }

  // Recorded only once a reservation is actually created, not on every
  // attempt — a slot that turns out taken shouldn't spend the same budget
  // a real booking does. Best-effort and outside the block above on
  // purpose: the reservation already committed, so a hiccup in this
  // bookkeeping write must never turn an actually-successful booking into
  // an error the guest sees with no confirmation code.
  try {
    await recordScopeAttempt(CREATE_SCOPE, ip);
  } catch {
    // swallowed — see comment above
  }
  return { ok: true, confirmationCode: reservation.confirmationCode };
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
  const ip = getClientIp(await headers());
  // Rate-limited attempts collapse into the same not_found a genuinely
  // missing code returns — a distinct "you're being throttled" response
  // would itself be a new way to tell a guessed code apart from a real one.
  if (await isScopeRateLimited(CANCEL_SCOPE, ip)) return { ok: false, error: "not_found" };
  await recordScopeAttempt(CANCEL_SCOPE, ip);

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
