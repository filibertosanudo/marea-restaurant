"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma, UserRole } from "@/lib/generated/prisma/client";
import { requireRole } from "@/lib/auth/permissions";
import { getCurrentBusiness } from "@/lib/business";

const ADMIN_ROLES = [UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN] as const;
const TESTIMONIALS_PATH = "/admin/testimonios";

/** True for Prisma's "no row matched this where" — same check as lib/promotions/actions.ts's isNotFoundError, so two admins racing the same row (one approves while the other rejects) fails gracefully instead of throwing. */
function isNotFoundError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025";
}

export type ModerationResult = { success: true } | { error: "not_found" };

export async function approveTestimonialAction(id: string): Promise<ModerationResult> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();
  try {
    await prisma.testimonial.update({
      where: { id, businessId: business.id },
      data: { status: "APPROVED" },
    });
  } catch (err) {
    if (isNotFoundError(err)) return { error: "not_found" };
    throw err;
  }
  revalidatePath(TESTIMONIALS_PATH);
  return { success: true };
}

/** Rejecting never edits or deletes the customer's words — it only moves the row out of the pending queue. */
export async function rejectTestimonialAction(id: string): Promise<ModerationResult> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();
  try {
    await prisma.testimonial.update({
      where: { id, businessId: business.id },
      data: { status: "REJECTED" },
    });
  } catch (err) {
    if (isNotFoundError(err)) return { error: "not_found" };
    throw err;
  }
  revalidatePath(TESTIMONIALS_PATH);
  return { success: true };
}

export async function toggleFeaturedTestimonialAction(
  id: string,
  isFeatured: boolean
): Promise<ModerationResult> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();
  try {
    await prisma.testimonial.update({
      where: { id, businessId: business.id },
      data: { isFeatured },
    });
  } catch (err) {
    if (isNotFoundError(err)) return { error: "not_found" };
    throw err;
  }
  revalidatePath(TESTIMONIALS_PATH);
  return { success: true };
}

/**
 * Same reorder shape as lib/menu/category-actions.ts's reorderCategoriesAction:
 * one transaction of `sortOrder: index` updates over the full ordered list the
 * drag-and-drop UI already computed client-side. Scoped to APPROVED so a
 * stale or tampered id list can't reorder rows outside the tab it came from.
 */
export async function reorderTestimonialsAction(orderedIds: string[]): Promise<ModerationResult> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();
  try {
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.testimonial.update({
          where: { id, businessId: business.id, status: "APPROVED" },
          data: { sortOrder: index },
        })
      )
    );
  } catch (err) {
    // All-or-nothing: if one row in the list was rejected or deleted by
    // another admin between the drag and this call, none of the sortOrder
    // updates apply — reported back so the queue can refetch its real order
    // instead of trusting the optimistic client-side reorder.
    if (isNotFoundError(err)) return { error: "not_found" };
    throw err;
  }
  revalidatePath(TESTIMONIALS_PATH);
  return { success: true };
}
