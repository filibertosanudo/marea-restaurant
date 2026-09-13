import "server-only";
import { prisma } from "@/lib/prisma";

export async function listPromotionsRaw(businessId: string) {
  return prisma.promotion.findMany({
    where: { businessId, deletedAt: null },
    // Not sortOrder — nothing in this module writes it yet, so every row
    // ties at 0 and it would be a dead clause that reads as "manually
    // orderable" before that's actually built.
    orderBy: { createdAt: "desc" },
    include: {
      translations: true,
      menuItems: { select: { menuItemId: true } },
    },
  });
}

export async function getPromotionByIdRaw(businessId: string, id: string) {
  return prisma.promotion.findFirst({
    where: { id, businessId, deletedAt: null },
    include: {
      translations: true,
      menuItems: { select: { menuItemId: true } },
    },
  });
}
