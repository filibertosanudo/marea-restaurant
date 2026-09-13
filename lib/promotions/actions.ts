"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma, UserRole } from "@/lib/generated/prisma/client";
import { requireRole } from "@/lib/auth/permissions";
import { getCurrentBusiness } from "@/lib/business";
import { buildPromotionSchema } from "@/lib/promotions/schemas";
import type { Lang } from "@/lib/i18n/lang";
import { slugify } from "@/lib/menu/slugify";
import { localWallClockToUtc } from "@/lib/reservations/availability";
import { flattenZodError } from "@/lib/forms/flatten-zod-error";

const ADMIN_ROLES = [UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN] as const;

export type PromotionFormState =
  | { success: true }
  | { error: string; fieldErrors?: Record<string, string> }
  | undefined;

function readPromotionForm(formData: FormData) {
  return {
    type: String(formData.get("type") ?? ""),
    code: String(formData.get("code") ?? ""),
    value: String(formData.get("value") ?? ""),
    minOrderTotal: String(formData.get("minOrderTotal") ?? ""),
    maxDiscount: String(formData.get("maxDiscount") ?? ""),
    startsAt: String(formData.get("startsAt") ?? ""),
    endsAt: String(formData.get("endsAt") ?? ""),
    daysOfWeek: formData.getAll("daysOfWeek").map(String),
    startTime: String(formData.get("startTime") ?? ""),
    endTime: String(formData.get("endTime") ?? ""),
    usageLimit: String(formData.get("usageLimit") ?? ""),
    perUserLimit: String(formData.get("perUserLimit") ?? ""),
    appliesToOrderType: String(formData.get("appliesToOrderType") ?? ""),
    isActive: formData.get("isActive") === "on",
    isFeatured: formData.get("isFeatured") === "on",
    menuItemIds: formData.getAll("menuItemIds").map(String),
    translations: {
      en: {
        title: String(formData.get("en.title") ?? ""),
        description: String(formData.get("en.description") ?? ""),
        badgeLabel: String(formData.get("en.badgeLabel") ?? ""),
      },
      es: {
        title: String(formData.get("es.title") ?? ""),
        description: String(formData.get("es.description") ?? ""),
        badgeLabel: String(formData.get("es.badgeLabel") ?? ""),
      },
    },
  };
}

function timeToMinutes(value: string | undefined): number | null {
  const match = value ? /^(\d{2}):(\d{2})$/.exec(value) : null;
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseLocalDateTime(value: string, timezone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return localWallClockToUtc(
    Number(year),
    Number(month),
    Number(day),
    Number(hour) * 60 + Number(minute),
    timezone
  );
}

async function nextUniqueSlug(businessId: string, baseSlug: string) {
  let slug = baseSlug;
  let suffix = 1;
  while (await prisma.promotion.findUnique({ where: { businessId_slug: { businessId, slug } } })) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
  return slug;
}

/**
 * PromotionMenuItem has no compound FK tying menuItemId to the promotion's
 * own business — only the UI's own picker keeps the two in scope. A server
 * action is a wider boundary than its form, so this re-checks ownership
 * server-side instead of trusting whatever ids arrived in the submission.
 */
async function scopeMenuItemIds(businessId: string, menuItemIds: string[]): Promise<string[]> {
  if (menuItemIds.length === 0) return [];
  const owned = await prisma.menuItem.findMany({
    where: { id: { in: menuItemIds }, businessId },
    select: { id: true },
  });
  return owned.map((m) => m.id);
}

/**
 * Which unique constraint a P2002 hit — Promotion has two (slug, code), and
 * only one of them is ever admin-facing. `meta.target`'s exact shape isn't
 * guaranteed stable across Prisma/driver versions, so this falls back to
 * the error message itself (which always names the columns) when target
 * doesn't resolve to anything useful.
 */
function conflictingField(err: unknown): "code" | "slug" | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return null;
  const target = err.meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : typeof target === "string" ? [target] : [];
  const haystack = (fields.length > 0 ? fields.join(" ") : err.message).toLowerCase();
  if (haystack.includes("code")) return "code";
  if (haystack.includes("slug")) return "slug";
  return null;
}

export async function createPromotionAction(
  _prevState: PromotionFormState,
  formData: FormData
): Promise<PromotionFormState> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();

  const parsed = buildPromotionSchema(business.defaultLocale as Lang).safeParse(
    readPromotionForm(formData)
  );
  if (!parsed.success) return { error: "invalid", fieldErrors: flattenZodError(parsed.error) };
  const data = parsed.data;

  const primaryTitle = data.translations[business.defaultLocale as Lang]?.title ?? "promotion";
  const startsAt = data.startsAt ? parseLocalDateTime(data.startsAt, business.timezone) : null;
  const endsAt = data.endsAt ? parseLocalDateTime(data.endsAt, business.timezone) : null;
  const menuItemIds = await scopeMenuItemIds(business.id, data.menuItemIds);

  // nextUniqueSlug's own check-then-insert can still lose a race to a
  // second create of the same title landing in between (a double-tap, two
  // admin tabs) — retried with a freshly recomputed slug instead of
  // surfacing that internal collision as a confusing error on the title.
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = await nextUniqueSlug(business.id, slugify(primaryTitle));
    try {
      await prisma.promotion.create({
        data: {
          businessId: business.id,
          slug,
          type: data.type,
          code: data.code || null,
          value: data.value,
          minOrderTotal: data.minOrderTotal || null,
          maxDiscount: data.maxDiscount || null,
          startsAt,
          endsAt,
          daysOfWeek: data.daysOfWeek,
          startMinute: timeToMinutes(data.startTime),
          endMinute: timeToMinutes(data.endTime),
          usageLimit: data.usageLimit === "" ? null : data.usageLimit,
          perUserLimit: data.perUserLimit === "" ? null : data.perUserLimit,
          appliesToOrderType: data.appliesToOrderType || null,
          isActive: data.isActive,
          isFeatured: data.isFeatured,
          translations: {
            create: (["en", "es"] as const)
              .filter((l) => data.translations[l]?.title)
              .map((l) => ({
                locale: l,
                title: data.translations[l]!.title,
                description: data.translations[l]!.description || null,
                badgeLabel: data.translations[l]!.badgeLabel || null,
              })),
          },
          menuItems: { create: menuItemIds.map((menuItemId) => ({ menuItemId })) },
        },
      });
      break;
    } catch (err) {
      const conflict = conflictingField(err);
      if (conflict === "code") return { error: "code_taken", fieldErrors: { code: "code_taken" } };
      if (conflict === "slug" && attempt < 2) continue;
      throw err;
    }
  }

  revalidatePath("/admin/promociones");
  return { success: true };
}

export async function updatePromotionAction(
  _prevState: PromotionFormState,
  formData: FormData
): Promise<PromotionFormState> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "missing id" };

  const parsed = buildPromotionSchema(business.defaultLocale as Lang).safeParse(
    readPromotionForm(formData)
  );
  if (!parsed.success) return { error: "invalid", fieldErrors: flattenZodError(parsed.error) };
  const data = parsed.data;

  const existing = await prisma.promotion.findFirst({
    where: { id, businessId: business.id, deletedAt: null },
  });
  if (!existing) return { error: "not_found" };

  const startsAt = data.startsAt ? parseLocalDateTime(data.startsAt, business.timezone) : null;
  const endsAt = data.endsAt ? parseLocalDateTime(data.endsAt, business.timezone) : null;
  const menuItemIds = await scopeMenuItemIds(business.id, data.menuItemIds);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.promotion.update({
        where: { id },
        data: {
          type: data.type,
          code: data.code || null,
          value: data.value,
          minOrderTotal: data.minOrderTotal || null,
          maxDiscount: data.maxDiscount || null,
          startsAt,
          endsAt,
          daysOfWeek: data.daysOfWeek,
          startMinute: timeToMinutes(data.startTime),
          endMinute: timeToMinutes(data.endTime),
          usageLimit: data.usageLimit === "" ? null : data.usageLimit,
          perUserLimit: data.perUserLimit === "" ? null : data.perUserLimit,
          appliesToOrderType: data.appliesToOrderType || null,
          isActive: data.isActive,
          isFeatured: data.isFeatured,
          // usageCount is deliberately absent: a counter with concurrent
          // writers (every checkout that redeems this promotion), moved
          // only by an atomic updateMany guard — same rule as
          // MenuItem.stockQuantity, never written by an update form.
        },
      });
      await Promise.all(
        (["en", "es"] as const)
          .filter((l) => data.translations[l]?.title)
          .map((l) =>
            tx.promotionTranslation.upsert({
              where: { promotionId_locale: { promotionId: id, locale: l } },
              update: {
                title: data.translations[l]!.title,
                description: data.translations[l]!.description || null,
                badgeLabel: data.translations[l]!.badgeLabel || null,
              },
              create: {
                promotionId: id,
                locale: l,
                title: data.translations[l]!.title,
                description: data.translations[l]!.description || null,
                badgeLabel: data.translations[l]!.badgeLabel || null,
              },
            })
          )
      );
      await tx.promotionMenuItem.deleteMany({ where: { promotionId: id } });
      if (menuItemIds.length > 0) {
        await tx.promotionMenuItem.createMany({
          data: menuItemIds.map((menuItemId) => ({ promotionId: id, menuItemId })),
        });
      }
    });
  } catch (err) {
    if (conflictingField(err) === "code") {
      return { error: "code_taken", fieldErrors: { code: "code_taken" } };
    }
    throw err;
  }

  revalidatePath("/admin/promociones");
  return { success: true };
}

/** True for Prisma's "no row matched this where" — a stale client (already-deleted target, wrong business) instead of a raw unhandled rejection. */
function isNotFoundError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025";
}

export async function toggleActivePromotionAction(
  id: string,
  isActive: boolean
): Promise<{ success: true } | { error: "not_found" }> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();
  try {
    await prisma.promotion.update({
      where: { id, businessId: business.id, deletedAt: null },
      data: { isActive },
    });
  } catch (err) {
    if (isNotFoundError(err)) return { error: "not_found" };
    throw err;
  }
  revalidatePath("/admin/promociones");
  return { success: true };
}

export async function deletePromotionAction(id: string): Promise<{ success: true } | { error: "not_found" }> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();
  try {
    await prisma.promotion.update({
      where: { id, businessId: business.id, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    });
  } catch (err) {
    if (isNotFoundError(err)) return { error: "not_found" };
    throw err;
  }
  revalidatePath("/admin/promociones");
  return { success: true };
}
