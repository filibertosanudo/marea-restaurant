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

/** Every table for the admin screen — active or not, since deactivating a table shouldn't make it disappear from the list that manages it. Soft-deleted ones are still excluded; there's nothing left to manage on those. */
export async function getTablesForAdmin(businessId: string) {
  return prisma.restaurantTable.findMany({
    where: { businessId, deletedAt: null },
    orderBy: [{ zone: "asc" }, { sortOrder: "asc" }],
  });
}

/** Existing codes sharing a prefix, for batch-create to pick up numbering where it left off instead of guessing a starting number that collides with what's already there. */
export async function getCodesWithPrefix(businessId: string, prefix: string): Promise<string[]> {
  const rows = await prisma.restaurantTable.findMany({
    where: { businessId, code: { startsWith: prefix } },
    select: { code: true },
  });
  return rows.map((r) => r.code);
}
