import "server-only";
import { prisma } from "@/lib/prisma";
import type { OrderType, Prisma } from "@/lib/generated/prisma/client";

const BOARD_INCLUDE = {
  table: true,
  items: { include: { modifiers: true }, orderBy: { createdAt: "asc" as const } },
  payments: { orderBy: { createdAt: "desc" as const }, take: 1 },
} satisfies Prisma.OrderInclude;

// Live statuses (PENDING/PREPARING/READY) show regardless of age — an order
// stuck for hours is exactly what the board exists to surface. DELIVERED and
// CANCELLED are "done"; without a window they'd accumulate on the board
// forever, so both are capped to a rolling recent window (a service shift,
// roughly) rather than a calendar-day boundary, which would need
// timezone-aware date math this module has no other reason to carry.
const RECENT_WINDOW_MS = 12 * 60 * 60 * 1000;

export type BoardFilters = {
  orderType?: OrderType;
  tableId?: string;
};

/** Pendiente · En preparación · Listo · Entregado (recent) — everything the kitchen board's columns need, one query. */
export async function listBoardOrdersRaw(businessId: string, filters: BoardFilters = {}) {
  return prisma.order.findMany({
    where: {
      businessId,
      OR: [
        { status: { in: ["PENDING", "PREPARING", "READY"] } },
        { status: "DELIVERED", placedAt: { gte: new Date(Date.now() - RECENT_WINDOW_MS) } },
      ],
      ...(filters.orderType ? { type: filters.orderType } : {}),
      ...(filters.tableId ? { tableId: filters.tableId } : {}),
    },
    orderBy: { placedAt: "asc" },
    include: BOARD_INCLUDE,
  });
}

/** The Cancelados tab — same recent window, its own query since it's a different tab, not a board column. */
export async function listCancelledOrdersRaw(businessId: string, filters: BoardFilters = {}) {
  return prisma.order.findMany({
    where: {
      businessId,
      status: "CANCELLED",
      placedAt: { gte: new Date(Date.now() - RECENT_WINDOW_MS) },
      ...(filters.orderType ? { type: filters.orderType } : {}),
      ...(filters.tableId ? { tableId: filters.tableId } : {}),
    },
    orderBy: { cancelledAt: "desc" },
    include: BOARD_INCLUDE,
  });
}

/** Active tables for the board's "por mesa" filter — table admin (creating/editing tables) is out of this module's scope, this just lists what already exists. */
export async function listActiveTablesRaw(businessId: string) {
  return prisma.restaurantTable.findMany({
    where: { businessId, isActive: true, deletedAt: null },
    orderBy: [{ zone: "asc" }, { sortOrder: "asc" }],
    select: { id: true, code: true, zone: true },
  });
}

/**
 * publicToken is the entire auth model for this page — an unauthenticated
 * guest reaches their order by knowing this token and nothing else (see
 * schema.prisma: cuid(2), not the guessable cuid() default). Never resolve
 * an order by id or orderNumber for a public-facing read.
 */
export async function getOrderByPublicToken(businessId: string, publicToken: string) {
  return prisma.order.findFirst({
    where: { businessId, publicToken },
    include: {
      table: true,
      items: { include: { modifiers: true }, orderBy: { createdAt: "asc" } },
    },
  });
}
