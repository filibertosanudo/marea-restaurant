"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/permissions";
import { getCurrentBusiness } from "@/lib/business";
import { buildModifierGroupSchema, buildModifierOptionSchema } from "@/lib/menu/schemas";
import { slugify } from "@/lib/menu/slugify";
import { UserRole } from "@/lib/generated/prisma/client";
import type { Lang } from "@/lib/i18n/lang";

const ADMIN_ROLES = [UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN] as const;

export type ModifierFormState =
  | { success: true }
  | { error: string; fieldErrors?: Record<string, string> }
  | undefined;

function readNameTranslations(formData: FormData) {
  return {
    en: { name: String(formData.get("en.name") ?? "") },
    es: { name: String(formData.get("es.name") ?? "") },
  };
}

async function nextUniqueGroupSlug(businessId: string, baseSlug: string) {
  let slug = baseSlug;
  let suffix = 1;
  while (
    await prisma.modifierGroup.findUnique({ where: { businessId_slug: { businessId, slug } } })
  ) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
  return slug;
}

async function nextUniqueOptionSlug(groupId: string, baseSlug: string) {
  let slug = baseSlug;
  let suffix = 1;
  while (await prisma.modifierOption.findUnique({ where: { groupId_slug: { groupId, slug } } })) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
  return slug;
}

export async function createModifierGroupAction(
  _prevState: ModifierFormState,
  formData: FormData
): Promise<ModifierFormState> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();

  const parsed = buildModifierGroupSchema(business.defaultLocale as Lang).safeParse({
    translations: readNameTranslations(formData),
    helpText: String(formData.get("helpText") ?? ""),
    selectionType: String(formData.get("selectionType") ?? "SINGLE"),
    isRequired: formData.get("isRequired") === "on",
    minSelections: formData.get("minSelections") || "0",
    maxSelections: formData.get("maxSelections") || undefined,
  });
  if (!parsed.success) return { error: "invalid", fieldErrors: flatten(parsed.error) };
  const data = parsed.data;

  const primaryName = data.translations[business.defaultLocale as Lang]?.name ?? "group";
  const slug = await nextUniqueGroupSlug(business.id, slugify(primaryName));

  await prisma.modifierGroup.create({
    data: {
      businessId: business.id,
      slug,
      selectionType: data.selectionType,
      isRequired: data.isRequired,
      minSelections: data.minSelections,
      maxSelections: data.maxSelections ?? null,
      translations: {
        create: (["en", "es"] as const)
          .filter((l) => data.translations[l]?.name)
          .map((l) => ({
            locale: l,
            name: data.translations[l]!.name,
            helpText: data.helpText || null,
          })),
      },
    },
  });

  revalidatePath("/admin/menu/modificadores");
  return { success: true };
}

export async function updateModifierGroupAction(
  _prevState: ModifierFormState,
  formData: FormData
): Promise<ModifierFormState> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "missing id" };

  const parsed = buildModifierGroupSchema(business.defaultLocale as Lang).safeParse({
    id,
    translations: readNameTranslations(formData),
    helpText: String(formData.get("helpText") ?? ""),
    selectionType: String(formData.get("selectionType") ?? "SINGLE"),
    isRequired: formData.get("isRequired") === "on",
    minSelections: formData.get("minSelections") || "0",
    maxSelections: formData.get("maxSelections") || undefined,
  });
  if (!parsed.success) return { error: "invalid", fieldErrors: flatten(parsed.error) };
  const data = parsed.data;

  const existing = await prisma.modifierGroup.findFirst({
    where: { id, businessId: business.id, deletedAt: null },
  });
  if (!existing) return { error: "not_found" };

  await prisma.$transaction([
    prisma.modifierGroup.update({
      where: { id },
      data: {
        selectionType: data.selectionType,
        isRequired: data.isRequired,
        minSelections: data.minSelections,
        maxSelections: data.maxSelections ?? null,
      },
    }),
    ...(["en", "es"] as const)
      .filter((l) => data.translations[l]?.name)
      .map((l) =>
        prisma.modifierGroupTranslation.upsert({
          where: { groupId_locale: { groupId: id, locale: l } },
          update: { name: data.translations[l]!.name, helpText: data.helpText || null },
          create: {
            groupId: id,
            locale: l,
            name: data.translations[l]!.name,
            helpText: data.helpText || null,
          },
        })
      ),
  ]);

  revalidatePath("/admin/menu/modificadores");
  return { success: true };
}

export async function deleteModifierGroupAction(id: string): Promise<{ blocked: boolean }> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();

  const appliedCount = await prisma.menuItemModifierGroup.count({ where: { groupId: id } });
  if (appliedCount > 0) return { blocked: true };

  await prisma.modifierGroup.update({
    where: { id, businessId: business.id },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/admin/menu/modificadores");
  return { blocked: false };
}

export async function createModifierOptionAction(
  _prevState: ModifierFormState,
  formData: FormData
): Promise<ModifierFormState> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();
  const groupId = String(formData.get("groupId") ?? "");

  const group = await prisma.modifierGroup.findFirst({
    where: { id: groupId, businessId: business.id, deletedAt: null },
  });
  if (!group) return { error: "not_found" };

  const parsed = buildModifierOptionSchema(business.defaultLocale as Lang).safeParse({
    groupId,
    translations: readNameTranslations(formData),
    priceDelta: String(formData.get("priceDelta") ?? "0"),
    isAvailable: formData.get("isAvailable") === "on",
    isDefault: formData.get("isDefault") === "on",
  });
  if (!parsed.success) return { error: "invalid", fieldErrors: flatten(parsed.error) };
  const data = parsed.data;

  const primaryName = data.translations[business.defaultLocale as Lang]?.name ?? "option";
  const slug = await nextUniqueOptionSlug(groupId, slugify(primaryName));

  await prisma.modifierOption.create({
    data: {
      groupId,
      slug,
      priceDelta: data.priceDelta,
      isAvailable: data.isAvailable,
      isDefault: data.isDefault,
      translations: {
        create: (["en", "es"] as const)
          .filter((l) => data.translations[l]?.name)
          .map((l) => ({ locale: l, name: data.translations[l]!.name })),
      },
    },
  });

  revalidatePath("/admin/menu/modificadores");
  return { success: true };
}

export async function updateModifierOptionAction(
  _prevState: ModifierFormState,
  formData: FormData
): Promise<ModifierFormState> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();
  const id = String(formData.get("id") ?? "");
  const groupId = String(formData.get("groupId") ?? "");
  if (!id) return { error: "missing id" };

  const option = await prisma.modifierOption.findFirst({
    where: { id, deletedAt: null, group: { businessId: business.id } },
  });
  if (!option) return { error: "not_found" };

  const parsed = buildModifierOptionSchema(business.defaultLocale as Lang).safeParse({
    id,
    groupId,
    translations: readNameTranslations(formData),
    priceDelta: String(formData.get("priceDelta") ?? "0"),
    isAvailable: formData.get("isAvailable") === "on",
    isDefault: formData.get("isDefault") === "on",
  });
  if (!parsed.success) return { error: "invalid", fieldErrors: flatten(parsed.error) };
  const data = parsed.data;

  await prisma.$transaction([
    prisma.modifierOption.update({
      where: { id },
      data: {
        priceDelta: data.priceDelta,
        isAvailable: data.isAvailable,
        isDefault: data.isDefault,
      },
    }),
    ...(["en", "es"] as const)
      .filter((l) => data.translations[l]?.name)
      .map((l) =>
        prisma.modifierOptionTranslation.upsert({
          where: { optionId_locale: { optionId: id, locale: l } },
          update: { name: data.translations[l]!.name },
          create: { optionId: id, locale: l, name: data.translations[l]!.name },
        })
      ),
  ]);

  revalidatePath("/admin/menu/modificadores");
  return { success: true };
}

export async function deleteModifierOptionAction(id: string) {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();
  await prisma.modifierOption.updateMany({
    where: { id, group: { businessId: business.id } },
    data: { deletedAt: new Date(), isAvailable: false },
  });
  revalidatePath("/admin/menu/modificadores");
}

function flatten(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    out[issue.path.join(".")] = issue.message;
  }
  return out;
}
