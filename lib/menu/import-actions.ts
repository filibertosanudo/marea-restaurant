"use server";

import { revalidatePath } from "next/cache";
import { invalidatePublicCache } from "@/lib/cache/public";
import { requireRole } from "@/lib/auth/permissions";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { getBusinessForRequest } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import { decodeCsvBytes } from "@/lib/menu/csv";
import { MAX_IMPORT_BYTES, normalizeKey, planMenuImport, type ExistingDish, type ImportPlan, type PlannedRow } from "@/lib/menu/import";
import { slugify } from "@/lib/menu/slugify";

/**
 * Menu import by CSV (module 19, phase 5). Two steps, both taking the file:
 * the preview writes nothing, and the import plans the file again itself
 * rather than trusting rows a browser sends back, so what gets written is
 * always what the same code would have shown.
 */

export type PreviewState =
  | { ok: false; error: "no_file" | "too_big" | "empty" | "missing_columns" | "too_many_rows"; missing?: string[] }
  | { ok: true; rows: PlannedRow[]; counts: { new: number; existing: number; duplicates: number; errors: number } }
  | undefined;

export type ImportResultState =
  | { ok: false; error: "no_file" | "too_big" | "empty" | "missing_columns" | "too_many_rows" }
  | { ok: true; created: number; updated: number; skippedExisting: number; skippedDuplicates: number; errors: number }
  | undefined;

type Loaded = { plan: ImportPlan } | { error: "no_file" | "too_big" };

async function loadPlan(formData: FormData, businessId: string, locale: string): Promise<Loaded> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "no_file" };
  if (file.size > MAX_IMPORT_BYTES) return { error: "too_big" };

  const text = decodeCsvBytes(new Uint8Array(await file.arrayBuffer()));
  const dishes = await prisma.menuItem.findMany({
    where: { businessId, deletedAt: null },
    select: {
      id: true,
      translations: { select: { locale: true, name: true } },
      category: { select: { translations: { select: { locale: true, name: true } } } },
    },
  });
  const pick = (translations: { locale: string; name: string }[]) =>
    (translations.find((t) => t.locale === locale) ?? translations[0])?.name ?? "";
  const existing: ExistingDish[] = dishes.map((d) => ({ id: d.id, category: pick(d.category.translations), name: pick(d.translations) }));
  return { plan: planMenuImport(text, existing) };
}

export async function previewMenuImportAction(_prev: PreviewState, formData: FormData): Promise<PreviewState> {
  await requireRole(...ADMIN_ROLES);
  const business = await getBusinessForRequest();

  const loaded = await loadPlan(formData, business.id, business.defaultLocale);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  return loaded.plan;
}

export async function commitMenuImportAction(_prev: ImportResultState, formData: FormData): Promise<ImportResultState> {
  await requireRole(...ADMIN_ROLES);
  const business = await getBusinessForRequest();
  const locale = business.defaultLocale === "en" ? "en" : "es";
  const updateExisting = formData.get("updateExisting") === "on";

  const loaded = await loadPlan(formData, business.id, locale);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  if (!loaded.plan.ok) return { ok: false, error: loaded.plan.error };
  const { rows, counts } = loaded.plan;

  const written = await prisma.$transaction(async (tx) => {
    const categories = await tx.menuCategory.findMany({
      where: { businessId: business.id, deletedAt: null },
      select: { id: true, translations: { select: { locale: true, name: true } } },
    });
    const categoryIds = new Map<string, string>();
    for (const category of categories) {
      const name = (category.translations.find((t) => t.locale === locale) ?? category.translations[0])?.name;
      if (name) categoryIds.set(normalizeKey(name), category.id);
    }
    const takenCategorySlugs = new Set((await tx.menuCategory.findMany({ where: { businessId: business.id }, select: { slug: true } })).map((c) => c.slug));
    const takenItemSlugs = new Set((await tx.menuItem.findMany({ where: { businessId: business.id }, select: { slug: true } })).map((i) => i.slug));
    const unique = (taken: Set<string>, base: string) => {
      const root = base || "item";
      let slug = root;
      for (let n = 2; taken.has(slug); n++) slug = `${root}-${n}`;
      taken.add(slug);
      return slug;
    };
    let sortOrder = ((await tx.menuCategory.aggregate({ where: { businessId: business.id }, _max: { sortOrder: true } }))._max.sortOrder ?? 0) + 1;

    const categoryFor = async (name: string) => {
      const key = normalizeKey(name);
      const known = categoryIds.get(key);
      if (known) return known;
      const created = await tx.menuCategory.create({
        data: {
          businessId: business.id,
          slug: unique(takenCategorySlugs, slugify(name)),
          sortOrder: sortOrder++,
          translations: { create: { locale, name } },
        },
      });
      categoryIds.set(key, created.id);
      return created.id;
    };

    let created = 0;
    let updated = 0;
    for (const row of rows) {
      if (row.status === "new" && row.price) {
        await tx.menuItem.create({
          data: {
            businessId: business.id,
            categoryId: await categoryFor(row.category),
            slug: unique(takenItemSlugs, slugify(row.name)),
            basePrice: row.price,
            translations: { create: { locale, name: row.name, description: row.description || null } },
          },
        });
        created += 1;
      } else if (row.status === "existing" && updateExisting && row.price && row.existingId) {
        // Scoped by business as everything else: an id the file could never
        // name is not one this loop could reach, but the where says so anyway.
        const result = await tx.menuItem.updateMany({
          where: { id: row.existingId, businessId: business.id, deletedAt: null },
          data: { basePrice: row.price, isSample: false },
        });
        if (result.count > 0) {
          await tx.menuItemTranslation.updateMany({
            where: { menuItemId: row.existingId, locale },
            data: { description: row.description || null },
          });
          updated += 1;
        }
      }
    }
    return { created, updated };
  });

  revalidatePath("/admin/menu");
  revalidatePath("/");
  invalidatePublicCache("menu", business.id);
  return {
    ok: true,
    created: written.created,
    updated: written.updated,
    skippedExisting: updateExisting ? 0 : counts.existing,
    skippedDuplicates: counts.duplicates,
    errors: counts.errors,
  };
}
