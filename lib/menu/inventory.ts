import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Keeps MenuItem.isAvailable in sync with a stock change that just crossed
 * zero, in either direction — shared by cancelOrderAction's restock and
 * adjustMenuItemStockAction, the two call sites that move one dish's stock
 * at a time (createOrderFromCart's sale-time decrement batches many dishes
 * per checkout, so it keeps its own multi-id updateMany instead of calling
 * this in a loop). Always inside the same transaction as the stockQuantity
 * write it follows, never a separate read-then-write.
 */
export async function syncAvailabilityFromStock(
  tx: Prisma.TransactionClient,
  input: { menuItemId: string; businessId: string; direction: "up" | "down" }
) {
  await tx.menuItem.updateMany({
    where: {
      id: input.menuItemId,
      businessId: input.businessId,
      deletedAt: null,
      stockQuantity: input.direction === "down" ? { lte: 0 } : { gt: 0 },
    },
    data: { isAvailable: input.direction === "up" },
  });
}
