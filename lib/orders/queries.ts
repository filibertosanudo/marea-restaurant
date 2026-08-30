import "server-only";
import { prisma } from "@/lib/prisma";
import type { OrderType, Prisma } from "@/lib/generated/prisma/client";

const BOARD_INCLUDE = {
  table: true,
  items: { include: { modifiers: true }, orderBy: { createdAt: "asc" as const } },
  // Every payment attempt, not just the latest — the card deciding whether
  // to show "Cobrar" reads computePaymentSummary over all of them (a card
  // attempt that failed, or that the guest abandoned for cash, must not
  // hide a still-open cash-register row just because it's not the newest).
  // A `select`, not `include`, on both levels — the board re-fetches every
  // order on every live SSE event, and computePaymentSummary/canCollectCash
  // only ever read status/amount/provider, never stripePaymentIntentId,
  // receiptUrl, or any of Payment's other columns.
  payments: {
    orderBy: { createdAt: "desc" as const },
    select: {
      status: true,
      amount: true,
      provider: true,
      refunds: { select: { status: true, amount: true } },
    },
  },
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
 * Every payment attempt (and each one's refunds) for a single order — the
 * board's own BOARD_INCLUDE deliberately takes only the latest payment
 * (that's all a kanban card needs); this is the fuller read for the
 * payment drawer, where "several attempts, one succeeded, one refunded
 * partially" is exactly the case that needs to be visible, not
 * simplified away.
 */
export async function getOrderPaymentDetailRaw(businessId: string, orderId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, businessId },
    select: {
      id: true,
      orderNumber: true,
      total: true,
      currency: true,
      payments: {
        orderBy: { createdAt: "desc" },
        include: { refunds: { orderBy: { createdAt: "desc" } } },
      },
    },
  });
}

/**
 * The order-plus-payments shape createPaymentIntentAction needs: is it
 * settled already, is there an open Stripe payment to reuse, what's the
 * live total to charge. A lighter select than getOrderPaymentDetailRaw's
 * (that one feeds the admin drawer's full history UI) since this is a
 * server-only check, not a render.
 */
export async function getOrderForPaymentIntentByPublicToken(businessId: string, publicToken: string) {
  return prisma.order.findFirst({
    where: { businessId, publicToken },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      total: true,
      currency: true,
      payments: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          amount: true,
          provider: true,
          stripePaymentIntentId: true,
          refunds: { select: { status: true, amount: true } },
        },
      },
    },
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
      // Latest payment only, same simplification the board's BOARD_INCLUDE
      // uses today — reading "paid" as the sum of SUCCEEDED payments across
      // every attempt is Fase 3's job (lib/payments/), not this query's.
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}
