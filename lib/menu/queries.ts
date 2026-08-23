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
