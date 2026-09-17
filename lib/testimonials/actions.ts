"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/lib/generated/prisma/client";
import { requireRole } from "@/lib/auth/permissions";
import { getCurrentBusiness } from "@/lib/business";

const ADMIN_ROLES = [UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN] as const;
const TESTIMONIALS_PATH = "/admin/testimonios";

export async function approveTestimonialAction(id: string) {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();
  await prisma.testimonial.update({
    where: { id, businessId: business.id },
    data: { status: "APPROVED" },
  });
  revalidatePath(TESTIMONIALS_PATH);
}

/** Rejecting never edits or deletes the customer's words — it only moves the row out of the pending queue. */
export async function rejectTestimonialAction(id: string) {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();
  await prisma.testimonial.update({
    where: { id, businessId: business.id },
    data: { status: "REJECTED" },
  });
  revalidatePath(TESTIMONIALS_PATH);
}

export async function toggleFeaturedTestimonialAction(id: string, isFeatured: boolean) {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();
  await prisma.testimonial.update({
    where: { id, businessId: business.id },
    data: { isFeatured },
  });
  revalidatePath(TESTIMONIALS_PATH);
}

/**
 * Same reorder shape as lib/menu/category-actions.ts's reorderCategoriesAction:
 * one transaction of `sortOrder: index` updates over the full ordered list the
 * drag-and-drop UI already computed client-side. Scoped to APPROVED so a
 * stale or tampered id list can't reorder rows outside the tab it came from.
 */
export async function reorderTestimonialsAction(orderedIds: string[]) {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.testimonial.update({
        where: { id, businessId: business.id, status: "APPROVED" },
        data: { sortOrder: index },
      })
    )
  );
  revalidatePath(TESTIMONIALS_PATH);
}
