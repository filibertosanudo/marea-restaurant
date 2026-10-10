import "server-only";
import { prisma } from "@/lib/prisma";

/** How many sample rows a business still has: what decides whether the panel offers "delete sample data". */
export async function countSampleRows(businessId: string): Promise<number> {
  const where = { businessId, isSample: true, deletedAt: null };
  const [items, categories, tables] = await Promise.all([
    prisma.menuItem.count({ where }),
    prisma.menuCategory.count({ where }),
    prisma.restaurantTable.count({ where }),
  ]);
  return items + categories + tables;
}
