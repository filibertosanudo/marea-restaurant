"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/permissions";
import { getCurrentBusiness } from "@/lib/business";
import { buildMenuItemSchema } from "@/lib/menu/schemas";
import { UserRole } from "@/lib/generated/prisma/client";
import type { Lang } from "@/lib/i18n/lang";
import { slugify } from "@/lib/menu/slugify";

const ADMIN_ROLES = [UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN] as const;
const STAFF_UP_ROLES = [UserRole.STAFF, UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN] as const;

export type MenuItemFormState =
  | { success: true }
  | { error: string; fieldErrors?: Record<string, string> }
  | undefined;

function readMenuItemForm(formData: FormData) {
  return {
    categoryId: String(formData.get("categoryId") ?? ""),
    basePrice: String(formData.get("basePrice") ?? ""),
    compareAtPrice: String(formData.get("compareAtPrice") ?? ""),
    imageUrl: String(formData.get("imageUrl") ?? ""),
    isAvailable: formData.get("isAvailable") === "on",
    isFeatured: formData.get("isFeatured") === "on",
    translations: {
      en: {
        name: String(formData.get("en.name") ?? ""),
        description: String(formData.get("en.description") ?? ""),
        imageAlt: String(formData.get("en.imageAlt") ?? ""),
      },
      es: {
        name: String(formData.get("es.name") ?? ""),
        description: String(formData.get("es.description") ?? ""),
        imageAlt: String(formData.get("es.imageAlt") ?? ""),
      },
    },
    tagIds: formData.getAll("tagIds").map(String),
    modifierGroupIds: formData.getAll("modifierGroupIds").map(String),
  };
}

async function nextUniqueSlug(businessId: string, baseSlug: string) {
  let slug = baseSlug;
  let suffix = 1;
  while (
    await prisma.menuItem.findUnique({ where: { businessId_slug: { businessId, slug } } })
  ) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
  return slug;
}

export async function createMenuItemAction(
  _prevState: MenuItemFormState,
  formData: FormData
): Promise<MenuItemFormState> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();

  const parsed = buildMenuItemSchema(business.defaultLocale as Lang).safeParse(
    readMenuItemForm(formData)
  );
  if (!parsed.success) {
    return { error: "invalid", fieldErrors: flatten(parsed.error) };
  }
  const data = parsed.data;

  const primaryName = data.translations[business.defaultLocale as Lang]?.name ?? "dish";
  const slug = await nextUniqueSlug(business.id, slugify(primaryName));

  await prisma.menuItem.create({
    data: {
      businessId: business.id,
      categoryId: data.categoryId,
      slug,
      basePrice: data.basePrice,
      compareAtPrice: data.compareAtPrice || null,
      imageUrl: data.imageUrl || null,
      isAvailable: data.isAvailable,
      isFeatured: data.isFeatured,
      translations: {
        create: (["en", "es"] as const)
          .filter((l) => data.translations[l]?.name)
          .map((l) => ({
            locale: l,
            name: data.translations[l]!.name,
            description: data.translations[l]!.description || null,
            imageAlt: data.translations[l]!.imageAlt || null,
          })),
      },
      tags: { create: data.tagIds.map((tagId) => ({ tagId })) },
      modifierGroups: {
        create: data.modifierGroupIds.map((groupId) => ({ groupId })),
      },
    },
  });

  revalidatePath("/admin/menu");
  return { success: true };
}

export async function updateMenuItemAction(
  _prevState: MenuItemFormState,
  formData: FormData
): Promise<MenuItemFormState> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "missing id" };

  const parsed = buildMenuItemSchema(business.defaultLocale as Lang).safeParse(
    readMenuItemForm(formData)
  );
  if (!parsed.success) {
    return { error: "invalid", fieldErrors: flatten(parsed.error) };
  }
  const data = parsed.data;

  const existing = await prisma.menuItem.findFirst({
    where: { id, businessId: business.id, deletedAt: null },
  });
  if (!existing) return { error: "not_found" };

  await prisma.$transaction([
    prisma.menuItem.update({
      where: { id },
      data: {
        categoryId: data.categoryId,
        basePrice: data.basePrice,
        compareAtPrice: data.compareAtPrice || null,
        imageUrl: data.imageUrl || null,
        isAvailable: data.isAvailable,
        isFeatured: data.isFeatured,
      },
    }),
    ...(["en", "es"] as const)
      .filter((l) => data.translations[l]?.name)
      .map((l) =>
        prisma.menuItemTranslation.upsert({
          where: { menuItemId_locale: { menuItemId: id, locale: l } },
          update: {
            name: data.translations[l]!.name,
            description: data.translations[l]!.description || null,
            imageAlt: data.translations[l]!.imageAlt || null,
          },
          create: {
            menuItemId: id,
            locale: l,
            name: data.translations[l]!.name,
            description: data.translations[l]!.description || null,
            imageAlt: data.translations[l]!.imageAlt || null,
          },
        })
      ),
    prisma.menuItemTag.deleteMany({ where: { menuItemId: id } }),
    prisma.menuItemTag.createMany({
      data: data.tagIds.map((tagId) => ({ menuItemId: id, tagId })),
    }),
    prisma.menuItemModifierGroup.deleteMany({ where: { menuItemId: id } }),
    prisma.menuItemModifierGroup.createMany({
      data: data.modifierGroupIds.map((groupId) => ({ menuItemId: id, groupId })),
    }),
  ]);

  revalidatePath("/admin/menu");
  return { success: true };
}

export async function toggleAvailabilityAction(id: string, isAvailable: boolean) {
  await requireRole(...STAFF_UP_ROLES);
  const business = await getCurrentBusiness();
  await prisma.menuItem.update({
    where: { id, businessId: business.id },
    data: { isAvailable },
  });
  revalidatePath("/admin/menu");
}

export async function softDeleteMenuItemAction(id: string) {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();
  await prisma.menuItem.update({
    where: { id, businessId: business.id },
    data: { deletedAt: new Date(), isAvailable: false },
  });
  revalidatePath("/admin/menu");
}

function flatten(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    out[issue.path.join(".")] = issue.message;
  }
  return out;
}
