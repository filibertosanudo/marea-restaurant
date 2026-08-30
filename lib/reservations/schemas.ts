import { z } from "zod";

/** How far out a guest can even ask about — rejected here, not in the action, so every caller of either schema gets it for free instead of remembering to check separately. 90 days is the common horizon real booking systems use; a business decision, not a derived constant. */
export const MAX_BOOKING_HORIZON_DAYS = 90;

const dateParamSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date")
  .refine((value) => {
    const { year, month, day } = parseDateParam(value);
    // Rejects "2026-02-30" the way a naive regex-only check wouldn't —
    // Date.UTC silently rolls an out-of-range day into the next month, so
    // this round-trips it and checks nothing moved.
    const d = new Date(Date.UTC(year, month - 1, day));
    return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
  }, "invalid_date")
  .refine((value) => {
    const { year, month, day } = parseDateParam(value);
    const target = Date.UTC(year, month - 1, day);
    const horizon = Date.now() + MAX_BOOKING_HORIZON_DAYS * 24 * 60 * 60 * 1000;
    return target <= horizon;
  }, "too_far_ahead");

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
