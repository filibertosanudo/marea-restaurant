"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/permissions";
import { getCurrentBusiness } from "@/lib/business";
import { buildMenuItemSchema } from "@/lib/menu/schemas";
import { UserRole } from "@/lib/generated/prisma/client";
import type { Lang } from "@/lib/i18n/lang";
import { slugify } from "@/lib/menu/slugify";
import { getStorageDriver } from "@/lib/storage";
import { syncAvailabilityFromStock } from "@/lib/menu/inventory";

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
    trackInventory: formData.get("trackInventory") === "on",
    stockQuantity: String(formData.get("stockQuantity") ?? "0"),
    minStockQuantity: String(formData.get("minStockQuantity") ?? "0"),
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
      trackInventory: data.trackInventory,
      // The only place stockQuantity is ever set outside a StockMovement:
      // a brand-new row has no prior count to reconcile against, so there's
      // nothing for a ledger entry to explain yet. Every change after this
      // one goes through adjustMenuItemStockAction instead.
      stockQuantity: data.trackInventory ? data.stockQuantity : 0,
      minStockQuantity: data.minStockQuantity,
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
  revalidatePath("/");
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

  // FOR UPDATE, not a plain read, because the old imageUrl decides what
  // gets deleted after commit: two overlapping saves of the same item (a
  // double-tap, two open tabs) could otherwise both read the same stale
  // "current" image, and the second one to finish would delete a key the
  // first one just made current. Locking makes the second transaction
  // block until the first commits, so it reads what the first one actually
  // left behind.
  // Tracking just turned on for a dish that never had it: there's no
  // concurrent writer to race yet (nothing could have sold or adjusted a
  // count that didn't exist), so this is an initialization, same as
  // createMenuItemAction's, not the kind of counter update that must go
  // through adjustMenuItemStockAction.
  const startingToTrack = data.trackInventory && !existing.trackInventory;

  const oldImageUrl = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ imageUrl: string | null }[]>`
      SELECT "imageUrl" FROM "MenuItem" WHERE id = ${id} FOR UPDATE
    `;

    await tx.menuItem.update({
      where: { id },
      data: {
        categoryId: data.categoryId,
        basePrice: data.basePrice,
        compareAtPrice: data.compareAtPrice || null,
        imageUrl: data.imageUrl || null,
        isAvailable: data.isAvailable,
        isFeatured: data.isFeatured,
        trackInventory: data.trackInventory,
        minStockQuantity: data.minStockQuantity,
        // Every other case leaves stockQuantity untouched: it's a counter
        // with concurrent writers (a sale, a cancellation, the quick-adjust
        // stepper), and this form submission carries whatever value was on
        // the page when the drawer opened. Writing it here would silently
        // undo any adjustment that landed in between — see
        // adjustMenuItemStockAction, the only other place that changes it.
        ...(startingToTrack ? { stockQuantity: data.stockQuantity } : {}),
      },
    });
    await Promise.all(
      (["en", "es"] as const)
        .filter((l) => data.translations[l]?.name)
        .map((l) =>
          tx.menuItemTranslation.upsert({
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
        )
    );
    await tx.menuItemTag.deleteMany({ where: { menuItemId: id } });
    await tx.menuItemTag.createMany({
      data: data.tagIds.map((tagId) => ({ menuItemId: id, tagId })),
    });
    await tx.menuItemModifierGroup.deleteMany({ where: { menuItemId: id } });
    await tx.menuItemModifierGroup.createMany({
      data: data.modifierGroupIds.map((groupId) => ({ menuItemId: id, groupId })),
    });

    return locked[0]?.imageUrl ?? null;
  });

  // Only after the row is safely pointing at the new image: deleting the
  // old key first (or inside the transaction above) risks a 404'ing row if
  // anything after that point failed. Best-effort and after the fact — a
  // failure here just leaves an orphaned key for the sweep script to catch,
  // never a row pointing at something that's already gone.
  if (oldImageUrl && oldImageUrl !== data.imageUrl) {
    const oldKey = getStorageDriver().keyFromUrl(oldImageUrl);
    if (oldKey) {
      // The URL field also accepts a pasted link, so two rows can end up
      // pointing at the same key (copy-pasted, not just uploaded) — never
      // delete a key another item still uses.
      const stillReferenced = await prisma.menuItem.findFirst({
        where: { id: { not: id }, imageUrl: oldImageUrl },
        select: { id: true },
      });
      if (!stillReferenced) {
        await getStorageDriver()
          .delete(oldKey)
          .catch((err) => console.error(`Failed to delete old menu item image ${oldKey}:`, err));
      }
    }
  }

  revalidatePath("/admin/menu");
  revalidatePath("/");
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
  revalidatePath("/");
}

export type AdjustStockState =
  | { success: true; stockQuantity: number; isAvailable: boolean }
  | { error: "invalid_delta" | "not_found" | "not_tracked" | "insufficient_stock" };

/**
 * The one place stockQuantity changes for a dish that already exists — the
 * quick +/- in ItemTable and the equivalent stepper in ItemEditorDrawer both
 * call this instead of going through the create/update form, so the
 * "sin excepciones" ledger rule (docs/prompts/14) has exactly one writer to
 * hold to it. Same atomic-guard pattern as createOrderFromCart's decrement:
 * the `gte` in the where clause makes the update itself the concurrency
 * check, never a prior read.
 */
export async function adjustMenuItemStockAction(
  menuItemId: string,
  delta: number
): Promise<AdjustStockState> {
  const session = await requireRole(...STAFF_UP_ROLES);
  const business = await getCurrentBusiness();
  if (!Number.isInteger(delta) || delta === 0) return { error: "invalid_delta" };

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.menuItem.updateMany({
      where: {
        id: menuItemId,
        businessId: business.id,
        deletedAt: null,
        trackInventory: true,
        ...(delta < 0 ? { stockQuantity: { gte: -delta } } : {}),
      },
      data: { stockQuantity: { increment: delta } },
    });
    if (updated.count === 0) {
      const current = await tx.menuItem.findFirst({
        where: { id: menuItemId, businessId: business.id, deletedAt: null },
        select: { trackInventory: true },
      });
      if (!current) return { error: "not_found" } as const;
      return { error: current.trackInventory ? "insufficient_stock" : "not_tracked" } as const;
    }

    await Promise.all([
      tx.stockMovement.create({
        data: {
          menuItemId,
          delta,
          reason: "MANUAL_ADJUSTMENT",
          createdById: session.user.id,
        },
      }),
      syncAvailabilityFromStock(tx, {
        menuItemId,
        businessId: business.id,
        direction: delta < 0 ? "down" : "up",
      }),
    ]);

    const item = await tx.menuItem.findUniqueOrThrow({
      where: { id: menuItemId },
      select: { stockQuantity: true, isAvailable: true },
    });
    return { success: true, ...item } as const;
  });

  if ("error" in result) return result;
  revalidatePath("/admin/menu");
  revalidatePath("/");
  return result;
}

export async function softDeleteMenuItemAction(id: string) {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();
  await prisma.menuItem.update({
    where: { id, businessId: business.id },
    data: { deletedAt: new Date(), isAvailable: false },
  });
  revalidatePath("/admin/menu");
  revalidatePath("/");
}

function flatten(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    out[issue.path.join(".")] = issue.message;
  }
  return out;
}
