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

/**
 * The landing's own read: featured promotions only, by sortOrder — the
 * business decides which subset of its promotions is worth a landing slot
 * the same way it decides which testimonials are worth featuring. Still
 * needs isActive/startsAt/endsAt/usageLimit — a promo left featured after it
 * expires must not advertise a discount the checkout engine won't honor
 * (see getPromotionStatus, the one function both this page and
 * /admin/promociones use to decide "is this live right now").
 */
export async function listFeaturedPromotionsRaw(businessId: string) {
  return prisma.promotion.findMany({
    where: { businessId, isFeatured: true, deletedAt: null },
    orderBy: { sortOrder: "asc" },
    include: { translations: true },
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
