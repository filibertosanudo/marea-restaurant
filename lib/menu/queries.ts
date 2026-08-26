import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";

// Centralized catalog queries — every read goes through here so
// `deletedAt: null` is never a `where` clause someone forgets to repeat
// elsewhere in the app (see docs/DATABASE.md and the project's non-negotiable
// rules: "Todo query de catálogo lleva deletedAt: null").

export async function listCategoriesRaw(businessId: string) {
  return prisma.menuCategory.findMany({
    where: { businessId, deletedAt: null },
    orderBy: { sortOrder: "asc" },
    include: {
      translations: true,
      _count: { select: { items: { where: { deletedAt: null } } } },
    },
  });
}

export async function getCategoryByIdRaw(businessId: string, id: string) {
  return prisma.menuCategory.findFirst({
    where: { id, businessId, deletedAt: null },
    include: { translations: true },
  });
}

export type MenuItemListParams = {
  search?: string;
  categoryId?: string;
  availability?: "available" | "unavailable";
  page: number;
  pageSize: number;
};

export async function listMenuItemsRaw(businessId: string, params: MenuItemListParams) {
  const where: Prisma.MenuItemWhereInput = {
    businessId,
    deletedAt: null,
    ...(params.categoryId ? { categoryId: params.categoryId } : {}),
    ...(params.availability
      ? { isAvailable: params.availability === "available" }
      : {}),
    ...(params.search
      ? {
          translations: {
            some: { name: { contains: params.search, mode: "insensitive" } },
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.menuItem.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        translations: true,
        category: { include: { translations: true } },
        tags: { include: { tag: { include: { translations: true } } } },
        modifierGroups: { select: { groupId: true } },
      },
    }),
    prisma.menuItem.count({ where }),
  ]);

  return { items, total };
}

export async function getMenuItemByIdRaw(businessId: string, id: string) {
  return prisma.menuItem.findFirst({
    where: { id, businessId, deletedAt: null },
    include: {
      translations: true,
      category: { include: { translations: true } },
      tags: { include: { tag: { include: { translations: true } } } },
      modifierGroups: { select: { groupId: true } },
    },
  });
}

export async function listTagsRaw(businessId: string) {
  return prisma.tag.findMany({
    where: { businessId },
    orderBy: { slug: "asc" },
    include: { translations: true },
  });
}

export async function listModifierGroupsRaw(businessId: string) {
  return prisma.modifierGroup.findMany({
    where: { businessId, deletedAt: null },
    orderBy: { sortOrder: "asc" },
    include: {
      translations: true,
      options: {
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" },
        include: { translations: true },
      },
      _count: { select: { menuItems: true } },
    },
  });
}

export async function getModifierGroupByIdRaw(businessId: string, id: string) {
  return prisma.modifierGroup.findFirst({
    where: { id, businessId, deletedAt: null },
    include: {
      translations: true,
      options: {
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" },
        include: { translations: true },
      },
      _count: { select: { menuItems: true } },
    },
  });
}

/**
 * The public-facing menu (landing page + /t/[qrToken] + /menu): only active
 * categories and available dishes, per docs/DATABASE.md's documented query.
 * Translations for every locale come back in one round trip (not filtered to
 * a single `locale`) so the caller can serve the client-side EN/ES switch
 * without a second fetch per language — see lib/menu/public-menu.ts.
 *
 * Includes tags and modifier groups/options (with their own translations)
 * because the order flow needs both to render a dish's detail sheet and to
 * validate a selection server-side — extended in place rather than
 * duplicated, per this module's own convention.
 */
export async function getPublicMenuRaw(businessId: string) {
  return prisma.menuCategory.findMany({
    where: { businessId, isActive: true, deletedAt: null },
    orderBy: { sortOrder: "asc" },
    include: {
      translations: true,
      items: {
        // A tracked dish at stockQuantity 0 is out, same as isAvailable
        // false, even though nothing flips its isAvailable flag until the
        // next checkout's decrement crosses zero (see createOrderFromCart).
        where: {
          isAvailable: true,
          deletedAt: null,
          OR: [{ trackInventory: false }, { stockQuantity: { gt: 0 } }],
        },
        orderBy: { sortOrder: "asc" },
        include: {
          translations: true,
          tags: { include: { tag: { include: { translations: true } } } },
          modifierGroups: {
            orderBy: { sortOrder: "asc" },
            include: {
              group: {
                include: {
                  translations: true,
                  options: {
                    where: { deletedAt: null },
                    orderBy: { sortOrder: "asc" },
                    include: { translations: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}

/**
 * A single available dish by id, with the same shape getPublicMenuRaw's
 * items have — used to re-read live price/availability/modifiers when
 * adding to cart or validating a cart line. Never trust a price or
 * modifier delta the client sends; this is what gets re-read instead.
 */
export async function getPublicMenuItemRaw(businessId: string, id: string) {
  return prisma.menuItem.findFirst({
    where: { id, businessId, deletedAt: null, category: { isActive: true, deletedAt: null } },
    include: {
      translations: true,
      tags: { include: { tag: { include: { translations: true } } } },
      modifierGroups: {
        orderBy: { sortOrder: "asc" },
        include: {
          group: {
            include: {
              translations: true,
              options: {
                where: { deletedAt: null },
                orderBy: { sortOrder: "asc" },
                include: { translations: true },
              },
            },
          },
        },
      },
    },
  });
}
