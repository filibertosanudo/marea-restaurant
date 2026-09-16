import { z } from "zod";
import type { Lang } from "@/lib/i18n/lang";

function localizedPromotionText(defaultLocale: Lang) {
  const required = z.object({
    title: z.string().min(1, "Required").max(120),
    description: z.string().max(1000).optional().default(""),
    badgeLabel: z.string().max(40).optional().default(""),
  });
  const optional = z.object({
    title: z.string().max(120).optional().default(""),
    description: z.string().max(1000).optional().default(""),
    badgeLabel: z.string().max(40).optional().default(""),
  });
  return z.object({
    en: defaultLocale === "en" ? required : optional,
    es: defaultLocale === "es" ? required : optional,
  });
}

const decimalAmount = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Invalid amount")
  .optional()
  .or(z.literal(""));

// Bounded on digit *value*, not just digit count — a server action is
// reachable directly, not just through the <input type="datetime-local">
// that would normally refuse "2026-02-30" or "18:99" client-side.
const DATE_PART = "\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])";
const TIME_PART = "([01]\\d|2[0-3]):[0-5]\\d";

// A datetime-local input's raw value ("2026-06-01T18:00"), converted to a
// real UTC instant against the business's own timezone at the point this
// is used — see parseLocalDateTime in actions.ts. Kept as a plain string
// here since format validation and timezone resolution are different
// concerns; this schema only owns the former.
const localDateTimeString = z
  .string()
  .regex(new RegExp(`^${DATE_PART}T${TIME_PART}$`), "Invalid date")
  .optional()
  .or(z.literal(""));

export function buildPromotionSchema(defaultLocale: Lang) {
  return z
    .object({
      id: z.string().optional(),
      type: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "BUNDLE_PRICE", "FREE_ITEM"]),
      code: z.string().max(40).optional().or(z.literal("")),
      value: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount"),
      minOrderTotal: decimalAmount,
      maxDiscount: decimalAmount,
      startsAt: localDateTimeString,
      endsAt: localDateTimeString,
      daysOfWeek: z.array(z.coerce.number().int().min(0).max(6)).default([]),
      // "HH:mm" from a native <input type="time"> — converted to
      // minutes-since-midnight in actions.ts, not here (format validation
      // and the minutes conversion are different concerns).
      startTime: z
        .string()
        .regex(new RegExp(`^${TIME_PART}$`), "Invalid time")
        .optional()
        .or(z.literal("")),
      endTime: z
        .string()
        .regex(new RegExp(`^${TIME_PART}$`), "Invalid time")
        .optional()
        .or(z.literal("")),
      usageLimit: z.coerce.number().int().min(1).optional().or(z.literal("")),
      perUserLimit: z.coerce.number().int().min(1).optional().or(z.literal("")),
      appliesToOrderType: z
        .enum(["DINE_IN", "TAKEAWAY", "PICKUP", "DELIVERY"])
        .optional()
        .or(z.literal("")),
      isActive: z.boolean().default(true),
      isFeatured: z.boolean().default(false),
      menuItemIds: z.array(z.string()).default([]),
      translations: localizedPromotionText(defaultLocale),
    })
    .refine((data) => (data.startTime === "") === (data.endTime === ""), {
      message: "Both start and end time are required together",
      path: ["endTime"],
    });
}
