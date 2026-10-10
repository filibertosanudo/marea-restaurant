"use server";

import { revalidatePath } from "next/cache";
import { invalidatePublicCache } from "@/lib/cache/public";
import { requireRole } from "@/lib/auth/permissions";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { getBusinessForRequest } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/menu/slugify";
import { nextTableCodes } from "@/lib/tables/codes";

/**
 * Sample data for a restaurant that has nothing yet (module 19, phase 5): a
 * small menu and four tables, so the owner sees the system full from the
 * first minute. Every row carries isSample, and "delete sample data" selects
 * on that and on nothing else. A row stops being a sample the moment the
 * owner acts on it (lib/onboarding/sample-adoption.ts), so deleting never
 * takes something the restaurant already made its own.
 */

const SAMPLE_MENU = [
  {
    key: "mains",
    name: { es: "Platos fuertes", en: "Main dishes" },
    items: [
      { name: { es: "Tacos de pescado", en: "Fish tacos" }, price: "145.00" },
      { name: { es: "Enchiladas verdes", en: "Green enchiladas" }, price: "130.00" },
      { name: { es: "Hamburguesa de la casa", en: "House burger" }, price: "165.00" },
    ],
  },
  {
    key: "drinks",
    name: { es: "Bebidas", en: "Drinks" },
    items: [
      { name: { es: "Agua de jamaica", en: "Hibiscus water" }, price: "40.00" },
      { name: { es: "Limonada", en: "Lemonade" }, price: "45.00" },
      { name: { es: "Café americano", en: "Americano" }, price: "38.00" },
    ],
  },
] as const;

const SAMPLE_TABLES = 4;
const SAMPLE_TABLE_PREFIX = "EJ-";

export type SampleDataResult =
  | { ok: true; categories: number; items: number; tables: number }
  | { ok: false; error: "already_there" | "not_empty" };

export async function createSampleDataAction(): Promise<SampleDataResult> {
  await requireRole(...ADMIN_ROLES);
  const business = await getBusinessForRequest();

  const [sampleRows, realItems, tableCount] = await Promise.all([
    prisma.menuItem.count({ where: { businessId: business.id, isSample: true, deletedAt: null } }),
    prisma.menuItem.count({ where: { businessId: business.id, isSample: false, deletedAt: null } }),
    prisma.restaurantTable.count({ where: { businessId: business.id, deletedAt: null } }),
  ]);
  if (sampleRows > 0) return { ok: false, error: "already_there" };
  // Never mixed into a menu somebody already wrote.
  if (realItems > 0) return { ok: false, error: "not_empty" };

  const result = await prisma.$transaction(async (tx) => {
    const takenSlugs = new Set(
      (await tx.menuCategory.findMany({ where: { businessId: business.id }, select: { slug: true } })).map((c) => c.slug)
    );
    const takenItemSlugs = new Set(
      (await tx.menuItem.findMany({ where: { businessId: business.id }, select: { slug: true } })).map((i) => i.slug)
    );
    const unique = (taken: Set<string>, base: string) => {
      let slug = base;
      for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
      taken.add(slug);
      return slug;
    };
    const firstSort = ((await tx.menuCategory.aggregate({ where: { businessId: business.id }, _max: { sortOrder: true } }))._max.sortOrder ?? 0) + 1;

    let items = 0;
    for (const [index, category] of SAMPLE_MENU.entries()) {
      const created = await tx.menuCategory.create({
        data: {
          businessId: business.id,
          slug: unique(takenSlugs, slugify(category.name[business.defaultLocale === "en" ? "en" : "es"])),
          sortOrder: firstSort + index,
          isSample: true,
          translations: { create: (["es", "en"] as const).map((locale) => ({ locale, name: category.name[locale] })) },
        },
      });
      for (const item of category.items) {
        await tx.menuItem.create({
          data: {
            businessId: business.id,
            categoryId: created.id,
            slug: unique(takenItemSlugs, slugify(item.name[business.defaultLocale === "en" ? "en" : "es"])),
            basePrice: item.price,
            isSample: true,
            translations: { create: (["es", "en"] as const).map((locale) => ({ locale, name: item.name[locale] })) },
          },
        });
        items += 1;
      }
    }

    let tables = 0;
    if (tableCount === 0) {
      const existing = (await tx.restaurantTable.findMany({ where: { businessId: business.id }, select: { code: true } })).map((t) => t.code);
      const codes = nextTableCodes(existing, SAMPLE_TABLE_PREFIX, SAMPLE_TABLES);
      await tx.restaurantTable.createMany({
        data: codes.map((code, index) => ({ businessId: business.id, code, seats: 4, sortOrder: index, isSample: true })),
      });
      tables = codes.length;
    }
    return { categories: SAMPLE_MENU.length, items, tables };
  });

  revalidatePath("/admin/menu");
  revalidatePath("/admin/mesas");
  invalidatePublicCache("menu", business.id);
  return { ok: true, ...result };
}

export type DeleteSampleResult = {
  deleted: { items: number; categories: number; tables: number };
  /** Rows the owner already used (an order, a reservation, a real dish inside): they stay, and stop being samples. */
  kept: { items: number; categories: number; tables: number };
};

export async function deleteSampleDataAction(): Promise<DeleteSampleResult> {
  await requireRole(...ADMIN_ROLES);
  const business = await getBusinessForRequest();
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    // Dishes. One that appears on an order line is a dish the restaurant has
    // sold: it is adopted, not removed. The rest are soft-deleted like any
    // dish deleted from the panel, so no history changes shape.
    const sampleItems = (
      await tx.menuItem.findMany({ where: { businessId: business.id, isSample: true, deletedAt: null }, select: { id: true } })
    ).map((i) => i.id);
    const sold = new Set(
      (await tx.orderItem.findMany({ where: { menuItemId: { in: sampleItems } }, select: { menuItemId: true } })).map((l) => l.menuItemId)
    );
    const itemsToDelete = sampleItems.filter((id) => !sold.has(id));
    const itemsToKeep = sampleItems.filter((id) => sold.has(id));
    await tx.menuItem.updateMany({
      where: { id: { in: itemsToDelete }, businessId: business.id, isSample: true },
      data: { deletedAt: now, isAvailable: false },
    });
    await tx.menuItem.updateMany({ where: { id: { in: itemsToKeep }, businessId: business.id }, data: { isSample: false } });

    // Categories, after their dishes: only one with nothing left in it goes.
    const sampleCategories = await tx.menuCategory.findMany({
      where: { businessId: business.id, isSample: true, deletedAt: null },
      select: { id: true },
    });
    let categoriesDeleted = 0;
    let categoriesKept = 0;
    for (const { id } of sampleCategories) {
      const remaining = await tx.menuItem.count({ where: { categoryId: id, businessId: business.id, deletedAt: null } });
      if (remaining > 0) {
        await tx.menuCategory.update({ where: { id }, data: { isSample: false } });
        categoriesKept += 1;
      } else {
        await tx.menuCategory.update({ where: { id }, data: { deletedAt: now, isActive: false } });
        categoriesDeleted += 1;
      }
    }

    // Tables: any reservation or order, of any status, makes it the owner's.
    const sampleTables = await tx.restaurantTable.findMany({
      where: { businessId: business.id, isSample: true, deletedAt: null },
      select: { id: true, code: true },
    });
    let tablesDeleted = 0;
    let tablesKept = 0;
    for (const table of sampleTables) {
      const [reservations, orders] = await Promise.all([
        tx.reservation.count({ where: { tableId: table.id, businessId: business.id } }),
        tx.order.count({ where: { tableId: table.id, businessId: business.id } }),
      ]);
      if (reservations + orders > 0) {
        await tx.restaurantTable.update({ where: { id: table.id }, data: { isSample: false } });
        tablesKept += 1;
      } else {
        // Same mangling deleteTableAction does: the code stays reusable.
        await tx.restaurantTable.update({
          where: { id: table.id },
          data: { deletedAt: now, isActive: false, code: `${table.code}::deleted::${table.id}` },
        });
        tablesDeleted += 1;
      }
    }

    return {
      deleted: { items: itemsToDelete.length, categories: categoriesDeleted, tables: tablesDeleted },
      kept: { items: itemsToKeep.length, categories: categoriesKept, tables: tablesKept },
    };
  });

  revalidatePath("/admin/menu");
  revalidatePath("/admin/mesas");
  invalidatePublicCache("menu", business.id);
  return result;
}
