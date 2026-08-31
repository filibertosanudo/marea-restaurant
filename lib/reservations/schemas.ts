import { z } from "zod";
import { businessLocalDateParts } from "./availability";

/** How far out a guest can even ask about — a business decision, not a derived constant. 90 days is the common horizon real booking systems use. */
export const MAX_BOOKING_HORIZON_DAYS = 90;

/**
 * Purely structural: a real "YYYY-MM-DD" calendar date, nothing about how
 * far away it is. That used to live here too as a third `.refine()`, but
 * `Date.now()` inside a Zod schema is exactly the impurity availability.ts
 * avoids on purpose elsewhere, and it compared against raw UTC instead of
 * the business's own timezone — accepting or rejecting a date right on the
 * horizon by a day depending on where the server process's clock sat
 * relative to that timezone. See isWithinBookingHorizon below, which a
 * caller runs once it actually has a `now` and a business to check against.
 */
export const dateParamSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date")
  .refine((value) => {
    const { year, month, day } = parseDateParam(value);
    // Rejects "2026-02-30" the way a naive regex-only check wouldn't —
    // Date.UTC silently rolls an out-of-range day into the next month, so
    // this round-trips it and checks nothing moved.
    const d = new Date(Date.UTC(year, month - 1, day));
    return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
  }, "invalid_date");

/**
 * Whether a calendar date falls within MAX_BOOKING_HORIZON_DAYS of "today"
 * — "today" resolved in the business's own timezone via `now` (injected,
 * never read from the clock in here), not the server process's raw UTC
 * date, which could be a different calendar day already.
 */
export function isWithinBookingHorizon(
  dateParts: { year: number; month: number; day: number },
  now: Date,
  timezone: string
): boolean {
  const today = businessLocalDateParts(now, timezone);
  const targetUtcMidnight = Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day);
  const todayUtcMidnight = Date.UTC(today.year, today.month - 1, today.day);
  const horizonMs = MAX_BOOKING_HORIZON_DAYS * 24 * 60 * 60 * 1000;
  return targetUtcMidnight <= todayUtcMidnight + horizonMs;
}

// Minutes since the requested day's local midnight, not a "HH:mm" string —
// a close-after-midnight window can offer two slots that would share the
// same "HH:mm" label (00:30 today vs. 00:30 the next calendar day), so the
// wire value has to be the raw, unreduced minute count availability.ts
// itself uses as each slot's actual identity. 4320 (3 days worth) is a
// generous sanity bound, not a business rule — nothing about how far a
// closesAt can run past midnight is capped elsewhere.
//
// Not z.coerce.number(): the only caller sends a real number over the
// Server Action already (ReservationForm.tsx's `Number(time)`), and
// coercing here would silently turn "", null, or false into 0 — a "valid"
// midnight slot — instead of rejecting a malformed direct call.
const timeParamSchema = z.number().int().min(0).max(4320);

export const reservationSlotsQuerySchema = z.object({
  date: dateParamSchema,
  partySize: z.coerce.number().int().min(1).max(200),
});

export const createReservationSchema = z
  .object({
    guestName: z.string().trim().min(1).max(120),
    guestEmail: z
      .union([z.email().max(200), z.literal("")])
      .optional()
      .transform((v) => (v ? v : undefined)),
    guestPhone: z
      .union([z.string().trim().min(5).max(30), z.literal("")])
      .optional()
      .transform((v) => (v ? v : undefined)),
    partySize: z.coerce.number().int().min(1).max(200),
    date: dateParamSchema,
    time: timeParamSchema,
    notes: z.string().trim().max(500).optional(),
  })
  .refine((data) => Boolean(data.guestEmail) || Boolean(data.guestPhone), {
    message: "contact_required",
    path: ["guestEmail"],
  });

export type CreateReservationInput = z.infer<typeof createReservationSchema>;

/** Splits a validated "YYYY-MM-DD" into the {year, month, day} shape availability.ts takes — never `new Date(string)`, which is exactly the client-side date-parsing this module avoids. */
export function parseDateParam(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}
