import { z } from "zod";
import { dateParamSchema } from "@/lib/reservations/schemas";

const timeStringSchema = z.string().regex(/^([0-1]\d|2[0-3]):[0-5]\d$/);

/**
 * The only timezones the settings screen actually offers — kept here (not
 * duplicated in the form component) so the schema validates against the
 * exact same list the admin can pick from, not an open-ended string a
 * malformed request could otherwise smuggle straight into Business.timezone
 * and break every localWallClockToUtc call across booking/availability.
 */
export const TIMEZONES = ["America/Hermosillo", "America/Mexico_City", "America/Tijuana"] as const;
export const CURRENCIES = ["MXN", "USD"] as const;

/**
 * A required minutes field submitted via FormData: `z.coerce.number()`
 * alone would turn a *missing* field (formData.get returns null) into 0
 * via Number(null), silently passing a `min(0)` floor as if 0 had been
 * chosen on purpose. Requiring a non-empty string first makes a missing
 * field fail validation instead of coercing into a real, if extreme,
 * value nobody actually chose.
 */
function requiredMinutes(min: number, max: number) {
  return z
    .string()
    .trim()
    .min(1)
    .transform((v) => Number(v))
    .pipe(z.number().int().min(min).max(max));
}

export const weeklyScheduleSchema = z.object({
  days: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        isOpen: z.boolean(),
        blocks: z.array(z.object({ opensAt: timeStringSchema, closesAt: timeStringSchema })).max(2),
      })
    )
    .length(7),
});

export const closureSchema = z
  .object({
    date: dateParamSchema,
    allDay: z.boolean(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    reason: z
      .string()
      .trim()
      .max(120)
      .optional()
      .transform((v) => (v ? v : undefined)),
  })
  .refine((v) => v.allDay || (v.startTime && v.endTime), { message: "time_required", path: ["startTime"] });

export const businessSettingsSchema = z
  .object({
    defaultLocale: z.enum(["es", "en"]),
    currency: z.enum(CURRENCIES),
    timezone: z.enum(TIMEZONES),
    defaultReservationMinutes: z.coerce.number().int().min(15).max(480),
    maxPartySize: z.coerce.number().int().min(1).max(50),
    acceptsOnlinePayment: z.boolean(),
    minBookingLeadMinutes: requiredMinutes(0, 1440),
    minCancelLeadMinutes: requiredMinutes(0, 4320),
  })
  // The asymmetry the deleted hardcoded constants (30 / 120) satisfied by
  // construction: a reservation shouldn't need more notice to book than it
  // needs to cancel, or a guest could book a slot they're already too late
  // to ever cancel.
  .refine((v) => v.minBookingLeadMinutes <= v.minCancelLeadMinutes, {
    message: "booking_lead_exceeds_cancel_lead",
    path: ["minBookingLeadMinutes"],
  });
