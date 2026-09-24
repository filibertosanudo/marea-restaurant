import "server-only";
import { prisma } from "@/lib/prisma";
import { cachedPublicRead } from "@/lib/cache/public";
import type { ReviewStatus } from "@/lib/generated/prisma/client";

/** One tab of the moderation queue — Pending/Approved/Rejected each read this the same way, ordered for what that tab needs. The screen derives its own tab-count badges from these lists' lengths, so there's no separate counting query to keep in sync. */
export async function listTestimonialsByStatusRaw(businessId: string, status: ReviewStatus) {
  return prisma.testimonial.findMany({
    where: { businessId, status, deletedAt: null },
    orderBy: status === "APPROVED" ? { sortOrder: "asc" } : { createdAt: "desc" },
    include: { translations: true },
  });
}

const featuredTestimonialsWhere = (businessId: string) =>
  ({ businessId, status: "APPROVED", isFeatured: true, deletedAt: null }) as const;

/**
 * The landing's own read: APPROVED and featured, by sortOrder. Approved
 * alone isn't enough — that's every review the moderation queue let
 * through, not the curated subset the business chose to actually show (the
 * "Approved" admin tab's star toggle is exactly that curation step).
 */
export async function listFeaturedTestimonialsRaw(businessId: string) {
  return prisma.testimonial.findMany({
    where: featuredTestimonialsWhere(businessId),
    orderBy: { sortOrder: "asc" },
    include: { translations: true },
  });
}

/** The landing's testimonials, from the data cache: only what the quote cards render. */
export function listFeaturedTestimonialsForLanding(businessId: string) {
  return cachedPublicRead("testimonials", "featured-testimonials", businessId, () =>
    prisma.testimonial.findMany({
      where: featuredTestimonialsWhere(businessId),
      orderBy: { sortOrder: "asc" },
      select: { authorName: true, rating: true, translations: { select: { locale: true, quote: true } } },
    })
  );
}

/** Duplicate-submission check for the public review form — one review per order, backed by the unique index on orderId (see schema.prisma). */
export async function getTestimonialByOrderId(orderId: string) {
  return prisma.testimonial.findUnique({ where: { orderId } });
}
