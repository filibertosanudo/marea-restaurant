import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Resolves a table by its QR token — never by id (see docs/DATABASE.md
 * §1.4: the token is rotatable and separate from the row's identity on
 * purpose). Inactive or soft-deleted tables resolve to null so the caller
 * can give an honest 404 instead of seating a guest at a mesa that no
 * longer exists.
 */
export async function getTableByQrToken(businessId: string, qrToken: string) {
  return prisma.restaurantTable.findFirst({
    where: { businessId, qrToken, isActive: true, deletedAt: null },
  });
}

export async function getTableById(businessId: string, id: string) {
  return prisma.restaurantTable.findFirst({
    where: { id, businessId, isActive: true, deletedAt: null },
  });
}
