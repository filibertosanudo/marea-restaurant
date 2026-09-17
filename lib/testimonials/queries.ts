import "server-only";
import { prisma } from "@/lib/prisma";
import type { ReviewStatus } from "@/lib/generated/prisma/client";

/** One tab of the moderation queue — Pending/Approved/Rejected each read this the same way, ordered for what that tab needs. The screen derives its own tab-count badges from these lists' lengths, so there's no separate counting query to keep in sync. */
export async function listTestimonialsByStatusRaw(businessId: string, status: ReviewStatus) {
  return prisma.testimonial.findMany({
    where: { businessId, status, deletedAt: null },
    orderBy: status === "APPROVED" ? { sortOrder: "asc" } : { createdAt: "desc" },
    include: { translations: true },
  });
}

/**
 * Only APPROVED testimonials are eligible for the public landing — written
 * now even though nothing consumes it until the landing is wired to the
 * database, so "what the public can see" is decided here, once, rather than
 * re-derived by whichever page ends up calling it.
 */
export async function listApprovedTestimonialsRaw(businessId: string) {
  return prisma.testimonial.findMany({
    where: { businessId, status: "APPROVED", deletedAt: null },
    orderBy: { sortOrder: "asc" },
    include: { translations: true },
  });
}

/** Duplicate-submission check for the public review form — one review per order, backed by the unique index on orderId (see schema.prisma). */
export async function getTestimonialByOrderId(orderId: string) {
  return prisma.testimonial.findUnique({ where: { orderId } });
}
