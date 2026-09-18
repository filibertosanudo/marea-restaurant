import "server-only";
import { prisma } from "@/lib/prisma";
import { cachedPublicRead } from "@/lib/cache/public";

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

/** Only what the landing's offers stage reads; `startsAt`/`endsAt` are Dates again after the cache. */
export type LandingPromotion = {
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  usageCount: number;
  translations: { locale: string; title: string; badgeLabel: string | null; description: string | null }[];
};

/**
 * The landing's own read: featured promotions only, by sortOrder, narrowed to
 * what the offers stage renders and served from the data cache. The business
 * decides which subset is worth a landing slot, the way it does for
 * testimonials. isActive/startsAt/endsAt/usageLimit still matter: a promo left
 * featured after it expires must not advertise a discount checkout won't
 * honor (see getPromotionStatus). That check runs against the request's own
 * clock, so an offer expires on time even while its row is cached.
 */
export async function listFeaturedPromotionsForLanding(businessId: string): Promise<LandingPromotion[]> {
  const rows = await cachedPublicRead("promotions", "featured-promotions", businessId, async () => {
    const promotions = await prisma.promotion.findMany({
      where: { businessId, isFeatured: true, deletedAt: null },
      orderBy: { sortOrder: "asc" },
      select: {
        isActive: true,
        startsAt: true,
        endsAt: true,
        usageLimit: true,
        usageCount: true,
        translations: { select: { locale: true, title: true, badgeLabel: true, description: true } },
      },
    });
    return promotions.map((p) => ({
      ...p,
      startsAt: p.startsAt?.toISOString() ?? null,
      endsAt: p.endsAt?.toISOString() ?? null,
    }));
  });
  return rows.map((p) => ({
    ...p,
    startsAt: p.startsAt === null ? null : new Date(p.startsAt),
    endsAt: p.endsAt === null ? null : new Date(p.endsAt),
  }));
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
