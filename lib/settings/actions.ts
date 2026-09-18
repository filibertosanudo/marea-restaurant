"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/permissions";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { getCurrentBusiness, invalidateBusinessCache } from "@/lib/business";
import { invalidatePublicCache } from "@/lib/cache/public";
import { localWallClockToUtc } from "@/lib/reservations/availability";
import { parseDateParam } from "@/lib/reservations/schemas";
import { flattenZodError } from "@/lib/forms/flatten-zod-error";
import { weeklyScheduleSchema, closureSchema, businessSettingsSchema, businessTranslationSchema } from "./schemas";
import { validateWeeklySchedule, normalizeBlock, parseTimeToMinutes, type DayScheduleInput } from "./schedule";

export type SettingsFormState =
  | { success: true }
  | { error: string; fieldErrors?: Record<string, string> }
  | undefined;

export type UpdateOpeningHoursResult =
  | { success: true }
  | { error: "invalid"; dayErrors: Record<number, string> };

/**
 * Full-week replace, not a per-row diff: the editor's "Guardar horario"
 * button saves the whole week at once, so there's no partial state to
 * reconcile — delete every existing row for this business and recreate
 * only the open days' blocks, inside one transaction so a mid-save crash
 * never leaves the business with half a week's hours.
 */
export async function updateOpeningHoursAction(days: DayScheduleInput[]): Promise<UpdateOpeningHoursResult> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();

  const parsed = weeklyScheduleSchema.safeParse({ days });
  if (!parsed.success) return { error: "invalid", dayErrors: {} };

  const scheduleErrors = validateWeeklySchedule(days);
  if (scheduleErrors.length > 0) {
    const dayErrors: Record<number, string> = {};
    for (const e of scheduleErrors) dayErrors[e.dayOfWeek] = e.message;
    return { error: "invalid", dayErrors };
  }

  // validateWeeklySchedule already confirmed every open day's blocks
  // normalize cleanly, so a null here would mean the two checks above
  // disagree with each other — filtered out rather than trusted blindly.
  const rows = parsed.data.days
    .filter((d) => d.isOpen)
    .flatMap((d) =>
      d.blocks
        .map((block) => ({ dayOfWeek: d.dayOfWeek, normalized: normalizeBlock(block) }))
        .filter((b): b is { dayOfWeek: number; normalized: NonNullable<ReturnType<typeof normalizeBlock>> } => b.normalized !== null)
    )
    .map(({ dayOfWeek, normalized }) => ({
      businessId: business.id,
      dayOfWeek,
      opensAt: normalized.opensAt,
      closesAt: normalized.closesAt,
      isClosed: false,
    }));

  // Locks the Business row first, same pattern as lockOrderForUpdate /
  // lockReservationForUpdate elsewhere in this codebase — without it, two
  // overlapping saves (two admins, or one admin in two tabs) can interleave
  // their delete-then-recreate under READ COMMITTED and leave the business
  // with an incomplete week, each save silently clobbering the other's.
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${business.id} FOR UPDATE`;
    await tx.openingHour.deleteMany({ where: { businessId: business.id } });
    await tx.openingHour.createMany({ data: rows });
  });

  revalidatePath("/admin/configuracion");
  invalidatePublicCache("hours", business.id);
  return { success: true };
}

/**
 * date + time-of-day are plain strings the whole way through this action —
 * localWallClockToUtc is the one place they turn into a real instant, and
 * it does that against the business's own timezone, never the admin
 * browser's. Same-day closures only (start and end share `date`); a
 * multi-day closure (vacations) is entered as one row per day for now —
 * BusinessClosure's schema supports a real range if that becomes worth
 * building a date-range picker for later.
 */
export async function createClosureAction(
  _prevState: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();

  const parsed = closureSchema.safeParse({
    date: formData.get("date"),
    allDay: formData.get("allDay") === "on",
    startTime: formData.get("startTime") || undefined,
    endTime: formData.get("endTime") || undefined,
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: "invalid", fieldErrors: flattenZodError(parsed.error) };

  const { year, month, day } = parseDateParam(parsed.data.date);
  const startMinutes = parsed.data.allDay ? 0 : parseTimeToMinutes(parsed.data.startTime ?? "");
  const endMinutes = parsed.data.allDay ? 1440 : parseTimeToMinutes(parsed.data.endTime ?? "");
  if (startMinutes === null || endMinutes === null) {
    return { error: "invalid", fieldErrors: { startTime: "invalid_time" } };
  }
  if (endMinutes <= startMinutes) {
    return { error: "invalid", fieldErrors: { endTime: "must_be_after_start" } };
  }

  const startsAt = localWallClockToUtc(year, month, day, startMinutes, business.timezone);
  const endsAt = localWallClockToUtc(year, month, day, endMinutes, business.timezone);

  await prisma.businessClosure.create({
    data: { businessId: business.id, startsAt, endsAt, reason: parsed.data.reason },
  });

  revalidatePath("/admin/configuracion");
  return { success: true };
}

export async function deleteClosureAction(id: string): Promise<void> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();
  await prisma.businessClosure.deleteMany({ where: { id, businessId: business.id } });
  revalidatePath("/admin/configuracion");
}

export async function updateBusinessSettingsAction(
  _prevState: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();

  const parsed = businessSettingsSchema.safeParse({
    defaultLocale: formData.get("defaultLocale"),
    currency: formData.get("currency"),
    timezone: formData.get("timezone"),
    defaultReservationMinutes: formData.get("defaultReservationMinutes"),
    maxPartySize: formData.get("maxPartySize"),
    acceptsOnlinePayment: formData.get("acceptsOnlinePayment") === "on",
    minBookingLeadMinutes: formData.get("minBookingLeadMinutes"),
    minCancelLeadMinutes: formData.get("minCancelLeadMinutes"),
    addressLine1: String(formData.get("addressLine1") ?? ""),
    addressLine2: String(formData.get("addressLine2") ?? ""),
    city: String(formData.get("city") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
  });
  if (!parsed.success) return { error: "invalid", fieldErrors: flattenZodError(parsed.error) };

  await prisma.business.update({
    where: { id: business.id },
    data: parsed.data,
  });

  revalidatePath("/admin/configuracion");
  revalidatePath("/");
  invalidateBusinessCache(business.id);
  return { success: true };
}

/** Full upsert per locale, same "write both locales at once" shape as the promotion/category editors — the form always submits both language tabs together, whether or not the admin touched one of them. */
export async function updateBusinessTranslationAction(
  _prevState: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();

  const parsed = businessTranslationSchema.safeParse({
    en: {
      tagline: String(formData.get("en.tagline") ?? ""),
      shortBlurb: String(formData.get("en.shortBlurb") ?? ""),
      aboutTitle: String(formData.get("en.aboutTitle") ?? ""),
      aboutBody: String(formData.get("en.aboutBody") ?? ""),
    },
    es: {
      tagline: String(formData.get("es.tagline") ?? ""),
      shortBlurb: String(formData.get("es.shortBlurb") ?? ""),
      aboutTitle: String(formData.get("es.aboutTitle") ?? ""),
      aboutBody: String(formData.get("es.aboutBody") ?? ""),
    },
  });
  if (!parsed.success) return { error: "invalid", fieldErrors: flattenZodError(parsed.error) };

  // A locale left entirely blank must not leave (or create) a row at all —
  // pickTranslation (lib/i18n/translations.ts), which the public landing
  // relies on for its "requested locale, else whatever exists" fallback,
  // treats a *present* row for the requested locale as a match even when
  // every field on it is null. An empty "en" row would then win over a
  // fully written "es" one instead of falling back to it.
  await prisma.$transaction(
    (["en", "es"] as const).map((locale) => {
      const data = parsed.data[locale];
      const isBlank = !data.tagline && !data.shortBlurb && !data.aboutTitle && !data.aboutBody;
      return isBlank
        ? prisma.businessTranslation.deleteMany({ where: { businessId: business.id, locale } })
        : prisma.businessTranslation.upsert({
            where: { businessId_locale: { businessId: business.id, locale } },
            update: data,
            create: { businessId: business.id, locale, ...data },
          });
    })
  );

  revalidatePath("/admin/configuracion");
  revalidatePath("/");
  invalidateBusinessCache(business.id);
  return { success: true };
}
