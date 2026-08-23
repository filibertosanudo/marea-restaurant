"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/permissions";
import { getCurrentBusiness } from "@/lib/business";
import { buildCategorySchema } from "@/lib/menu/schemas";
import { UserRole } from "@/lib/generated/prisma/client";
import type { Lang } from "@/lib/i18n/lang";

const ADMIN_ROLES = [UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN] as const;

export type CategoryFormState =
  | { success: true }
  | { error: string; fieldErrors?: Record<string, string> }
  | undefined;

// Strips Unicode combining diacritical marks (U+0300-U+036F) left behind by
// NFD normalization, so "Café" -> "cafe" instead of "café".
const COMBINING_DIACRITICS = /[̀-ͯ]/g;

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function readTranslationsFromForm(formData: FormData) {
  return {
    en: {
      name: String(formData.get("en.name") ?? ""),
      description: String(formData.get("en.description") ?? ""),
    },
    es: {
      name: String(formData.get("es.name") ?? ""),
      description: String(formData.get("es.description") ?? ""),
    },
  };
}

export async function createCategoryAction(
  _prevState: CategoryFormState,
  formData: FormData
): Promise<CategoryFormState> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();

  const parsed = buildCategorySchema(business.defaultLocale as Lang).safeParse({
    translations: readTranslationsFromForm(formData),
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) {
    return { error: "invalid", fieldErrors: flatten(parsed.error) };
  }

  const primaryName =
    parsed.data.translations[business.defaultLocale as Lang]?.name ?? "category";
  const baseSlug = slugify(primaryName);

  let slug = baseSlug;
  let suffix = 1;
  while (await prisma.menuCategory.findUnique({ where: { businessId_slug: { businessId: business.id, slug } } })) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  const maxSortOrder = await prisma.menuCategory.aggregate({
    where: { businessId: business.id },
    _max: { sortOrder: true },
  });

  await prisma.menuCategory.create({
    data: {
      businessId: business.id,
      slug,
      isActive: parsed.data.isActive,
      sortOrder: (maxSortOrder._max.sortOrder ?? 0) + 1,
      translations: {
        create: (["en", "es"] as const)
          .filter((locale) => parsed.data.translations[locale]?.name)
          .map((locale) => ({
            locale,
            name: parsed.data.translations[locale]!.name,
            description: parsed.data.translations[locale]!.description || null,
          })),
      },
    },
  });

  revalidatePath("/admin/menu/categorias");
  return { success: true };
}

export async function updateCategoryAction(
  _prevState: CategoryFormState,
  formData: FormData
): Promise<CategoryFormState> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "missing id" };

  const parsed = buildCategorySchema(business.defaultLocale as Lang).safeParse({
    id,
    translations: readTranslationsFromForm(formData),
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) {
    return { error: "invalid", fieldErrors: flatten(parsed.error) };
  }

  const category = await prisma.menuCategory.findFirst({
    where: { id, businessId: business.id, deletedAt: null },
  });
  if (!category) return { error: "not_found" };

  await prisma.$transaction([
    prisma.menuCategory.update({
      where: { id },
      data: { isActive: parsed.data.isActive },
    }),
    ...(["en", "es"] as const)
      .filter((locale) => parsed.data.translations[locale]?.name)
      .map((locale) =>
        prisma.menuCategoryTranslation.upsert({
          where: { categoryId_locale: { categoryId: id, locale } },
          update: {
            name: parsed.data.translations[locale]!.name,
            description: parsed.data.translations[locale]!.description || null,
          },
          create: {
            categoryId: id,
            locale,
            name: parsed.data.translations[locale]!.name,
            description: parsed.data.translations[locale]!.description || null,
          },
        })
      ),
  ]);

  revalidatePath("/admin/menu/categorias");
  return { success: true };
}

export async function toggleCategoryActiveAction(id: string, isActive: boolean) {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();
  await prisma.menuCategory.update({
    where: { id, businessId: business.id },
    data: { isActive },
  });
  revalidatePath("/admin/menu/categorias");
}

export async function reorderCategoriesAction(orderedIds: string[]) {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.menuCategory.update({
        where: { id, businessId: business.id },
        data: { sortOrder: index },
      })
    )
  );
  revalidatePath("/admin/menu/categorias");
}

export async function deleteCategoryAction(
  id: string
): Promise<{ blocked: boolean }> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();

  const itemCount = await prisma.menuItem.count({
    where: { categoryId: id, businessId: business.id, deletedAt: null },
  });
  if (itemCount > 0) {
    return { blocked: true };
  }

  await prisma.menuCategory.update({
    where: { id, businessId: business.id },
    data: { deletedAt: new Date(), isActive: false },
  });
  revalidatePath("/admin/menu/categorias");
  return { blocked: false };
}

function flatten(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    out[issue.path.join(".")] = issue.message;
  }
  return out;
}
