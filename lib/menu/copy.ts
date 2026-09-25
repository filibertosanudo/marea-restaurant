import "server-only";
import { createId } from "@paralleldrive/cuid2";
import { prisma } from "@/lib/prisma";
import { runInTenant } from "@/lib/tenancy/context";
import type { StorageDriver } from "@/lib/storage/driver";

/**
 * Copying a sister branch's menu into a new one. A chain of three keeps three
 * menus (they are independent by design, no inheritance); this is the cheap way
 * out of typing the same menu three times.
 *
 * It reads the source inside the source business's own scope and writes the
 * target inside the target's, so row level security is never asked to allow
 * anything it would not allow to either business's own admin. Whether the
 * caller may act on both is decided before this is called (copy-actions.ts).
 *
 * WHAT IS COPIED: categories, dishes, tags, modifier groups and options, with
 * every translation and the links between them, and the dish photos. WHAT IS
 * NOT: prices are copied as they are (a branch edits them after), but stock
 * counts start at zero and inventory tracking off, orders, carts and promotions
 * are not menu, and soft-deleted rows stay behind.
 *
 * ONLY INTO AN EMPTY MENU. A merge would need a policy for every clash (same
 * slug, different price) and a wrong guess is a silently wrong price list.
 * "This branch has no menu yet" is the case that matters and needs none.
 *
 * PHOTOS ARE COPIED, NOT SHARED. Two dishes pointing at one stored file means
 * deleting one branch's photo deletes the other's (the upload action removes
 * the old key). Files held in our own storage get a new key; a URL that points
 * elsewhere (a static image, an address an admin pasted) is kept as is.
 */
export type CopyMenuResult =
  | { ok: true; categories: number; dishes: number; photos: number }
  | { ok: false; error: "target_not_empty" | "source_empty" };

async function readSource(businessId: string) {
  return runInTenant(businessId, async () => {
    const [categories, tags, groups] = await Promise.all([
      prisma.menuCategory.findMany({
        where: { businessId, deletedAt: null },
        orderBy: { sortOrder: "asc" },
        include: {
          translations: true,
          items: {
            where: { deletedAt: null },
            orderBy: { sortOrder: "asc" },
            include: {
              translations: true,
              tags: { include: { tag: { select: { slug: true } } } },
              modifierGroups: { include: { group: { select: { slug: true, deletedAt: true } } } },
            },
          },
        },
      }),
      prisma.tag.findMany({ where: { businessId }, include: { translations: true } }),
      prisma.modifierGroup.findMany({
        where: { businessId, deletedAt: null },
        orderBy: { sortOrder: "asc" },
        include: {
          translations: true,
          options: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" }, include: { translations: true } },
        },
      }),
    ]);
    return { categories, tags, groups };
  });
}

async function targetIsEmpty(businessId: string): Promise<boolean> {
  // Soft-deleted rows count: they still hold their slugs, which are unique per business.
  const [categories, items, tags, groups] = await Promise.all([
    prisma.menuCategory.count({ where: { businessId } }),
    prisma.menuItem.count({ where: { businessId } }),
    prisma.tag.count({ where: { businessId } }),
    prisma.modifierGroup.count({ where: { businessId } }),
  ]);
  return categories + items + tags + groups === 0;
}

/** A stored photo copied under a new key; anything that is not ours, or cannot be read, is left as it was (or dropped when it cannot be kept). */
async function copyPhoto(storage: StorageDriver, url: string | null, created: string[]): Promise<string | null> {
  if (!url) return null;
  const key = storage.keyFromUrl(url);
  if (key === null) return url;

  const stored = await storage.get(key);
  if (!stored) return null;
  const extension = /\.[a-z0-9]+$/i.exec(key)?.[0] ?? "";
  const copied = await storage.put({ body: stored.body, contentType: stored.contentType, key: `menu-items/${createId()}${extension}` });
  created.push(copied.key);
  return copied.url;
}

export async function copyMenu(input: {
  sourceBusinessId: string;
  targetBusinessId: string;
  storage: StorageDriver;
}): Promise<CopyMenuResult> {
  const { sourceBusinessId, targetBusinessId, storage } = input;

  const source = await readSource(sourceBusinessId);
  if (source.categories.length === 0) return { ok: false, error: "source_empty" };
  if (!(await runInTenant(targetBusinessId, () => targetIsEmpty(targetBusinessId)))) {
    return { ok: false, error: "target_not_empty" };
  }

  // Photos first, outside the transaction; removed again if the write fails.
  const createdKeys: string[] = [];
  const photoByItem = new Map<string, string | null>();
  try {
    for (const category of source.categories) {
      for (const item of category.items) photoByItem.set(item.id, await copyPhoto(storage, item.imageUrl, createdKeys));
    }

    const counts = await runInTenant(targetBusinessId, () =>
      prisma.$transaction(async (tx) => {
        const tagIds = new Map<string, string>();
        for (const tag of source.tags) {
          const created = await tx.tag.create({
            data: {
              businessId: targetBusinessId,
              slug: tag.slug,
              icon: tag.icon,
              color: tag.color,
              translations: { create: tag.translations.map((t) => ({ locale: t.locale, label: t.label })) },
            },
          });
          tagIds.set(tag.slug, created.id);
        }

        const groupIds = new Map<string, string>();
        for (const group of source.groups) {
          const created = await tx.modifierGroup.create({
            data: {
              businessId: targetBusinessId,
              slug: group.slug,
              selectionType: group.selectionType,
              isRequired: group.isRequired,
              minSelections: group.minSelections,
              maxSelections: group.maxSelections,
              sortOrder: group.sortOrder,
              translations: { create: group.translations.map((t) => ({ locale: t.locale, name: t.name, helpText: t.helpText })) },
              options: {
                create: group.options.map((o) => ({
                  slug: o.slug,
                  priceDelta: o.priceDelta,
                  isAvailable: o.isAvailable,
                  isDefault: o.isDefault,
                  sortOrder: o.sortOrder,
                  translations: { create: o.translations.map((t) => ({ locale: t.locale, name: t.name })) },
                })),
              },
            },
          });
          groupIds.set(group.slug, created.id);
        }

        let dishes = 0;
        for (const category of source.categories) {
          const createdCategory = await tx.menuCategory.create({
            data: {
              businessId: targetBusinessId,
              slug: category.slug,
              imageUrl: category.imageUrl,
              sortOrder: category.sortOrder,
              isActive: category.isActive,
              translations: { create: category.translations.map((t) => ({ locale: t.locale, name: t.name, description: t.description })) },
            },
          });

          for (const item of category.items) {
            await tx.menuItem.create({
              data: {
                businessId: targetBusinessId,
                categoryId: createdCategory.id,
                slug: item.slug,
                sku: item.sku,
                basePrice: item.basePrice,
                compareAtPrice: item.compareAtPrice,
                imageUrl: photoByItem.get(item.id) ?? null,
                isAvailable: item.isAvailable,
                // Stock is a fact about one kitchen's shelves, not a menu.
                trackInventory: false,
                stockQuantity: 0,
                isFeatured: item.isFeatured,
                preparationMinutes: item.preparationMinutes,
                calories: item.calories,
                sortOrder: item.sortOrder,
                translations: {
                  create: item.translations.map((t) => ({ locale: t.locale, name: t.name, description: t.description, imageAlt: t.imageAlt })),
                },
                tags: { create: item.tags.flatMap((t) => (tagIds.has(t.tag.slug) ? [{ tagId: tagIds.get(t.tag.slug)! }] : [])) },
                modifierGroups: {
                  create: item.modifierGroups.flatMap((g) =>
                    g.group.deletedAt === null && groupIds.has(g.group.slug)
                      ? [{ groupId: groupIds.get(g.group.slug)!, sortOrder: g.sortOrder, isRequired: g.isRequired }]
                      : []
                  ),
                },
              },
            });
            dishes += 1;
          }
        }
        return { categories: source.categories.length, dishes };
      })
    );

    return { ok: true, ...counts, photos: createdKeys.length };
  } catch (err) {
    // Nothing was written; do not leave the copied photos behind.
    await Promise.all(createdKeys.map((key) => storage.delete(key).catch(() => {})));
    throw err;
  }
}
