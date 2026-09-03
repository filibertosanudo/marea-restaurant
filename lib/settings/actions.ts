"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/permissions";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { getCurrentBusiness } from "@/lib/business";
import { localWallClockToUtc } from "@/lib/reservations/availability";
import { parseDateParam } from "@/lib/reservations/schemas";
import { flattenZodError } from "@/lib/forms/flatten-zod-error";
import { weeklyScheduleSchema, closureSchema, businessSettingsSchema } from "./schemas";
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
  });
  if (!parsed.success) return { error: "invalid", fieldErrors: flattenZodError(parsed.error) };

  await prisma.business.update({
    where: { id: business.id },
    data: parsed.data,
  });

  revalidatePath("/admin/configuracion");
  return { success: true };
}
