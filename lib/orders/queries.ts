import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import type { OrderType } from "@/lib/generated/prisma/client";
import type { BoardColumnStatus } from "@/lib/orders/state-machine";
import type { BoardCursor } from "@/lib/orders/board-cursor";

const BOARD_INCLUDE = {
  // Only what a card reads (toBoardOrderDTO): the table's code, and for each
  // line its name, quantity, note and its modifiers' names. The full rows also
  // carry prices, ids of the catalogue rows and timestamps the card never
  // shows, on every event and every refresh.
  table: { select: { code: true } },
  items: {
    select: {
      id: true,
      nameSnapshot: true,
      quantity: true,
      notes: true,
      modifiers: { select: { nameSnapshot: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
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
  // Latest kitchen ticket only — "did it print" answered per order, right
  // where staff already are, per the module's own justification for a
  // queue over a fire-and-forget signal.
  printJobs: {
    where: { kind: "KITCHEN_TICKET" },
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: { status: true },
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

/** Cards per column on first paint, and per "ver más". A kitchen with more than this pending has a problem scrolling does not solve. */
export const BOARD_PAGE_SIZE = 50;

function columnWhere(businessId: string, status: BoardColumnStatus, filters: BoardFilters): Prisma.OrderWhereInput {
  return {
    businessId,
    status,
    // Live statuses show regardless of age; DELIVERED only inside the recent window.
    ...(status === "DELIVERED" ? { placedAt: { gte: new Date(Date.now() - RECENT_WINDOW_MS) } } : {}),
    ...(filters.orderType ? { type: filters.orderType } : {}),
    ...(filters.tableId ? { tableId: filters.tableId } : {}),
  };
}

/**
 * One page of one board column, oldest first. Fetches one card more than asked
 * so `hasMore` is known without a second count. `after` is the last card of the
 * previous page (see board-cursor.ts).
 */
export async function listBoardPageRaw(
  businessId: string,
  status: BoardColumnStatus,
  filters: BoardFilters = {},
  page: { after?: BoardCursor | null; take?: number } = {}
) {
  const take = page.take ?? BOARD_PAGE_SIZE;
  const after = page.after;
  const base = columnWhere(businessId, status, filters);
  const rows = await prisma.order.findMany({
    where: after
      ? {
          AND: [
            base,
            {
              OR: [
                { placedAt: { gt: new Date(after.placedAt) } },
                { placedAt: new Date(after.placedAt), id: { gt: after.id } },
              ],
            },
          ],
        }
      : base,
    orderBy: [{ placedAt: "asc" }, { id: "asc" }],
    take: take + 1,
    include: BOARD_INCLUDE,
  });
  return { orders: rows.slice(0, take), hasMore: rows.length > take };
}

/**
 * The first page of several columns at once, for first paint. One statement
 * ranks each column's orders and keeps the first `perColumn` ids, then one read
 * fetches those cards. Prisma loads every relation with a statement of its own
 * (seven for a board card), so three column queries cost about twenty-one
 * statements a render and this costs about eight, on a page that re-reads
 * every minute.
 */
export async function listBoardFirstPagesRaw(
  businessId: string,
  statuses: BoardColumnStatus[],
  filters: BoardFilters = {},
  perColumn: number = BOARD_PAGE_SIZE
) {
  const type = filters.orderType ? Prisma.sql`AND type = ${filters.orderType}::"OrderType"` : Prisma.empty;
  const table = filters.tableId ? Prisma.sql`AND "tableId" = ${filters.tableId}` : Prisma.empty;
  const ranked = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM (
      SELECT id, row_number() OVER (PARTITION BY status ORDER BY "placedAt", id) AS n
      FROM "Order"
      WHERE "businessId" = ${businessId}
        AND status = ANY(${statuses}::"OrderStatus"[])
        ${type}
        ${table}
    ) ranked
    WHERE n <= ${perColumn}
  `;
  if (ranked.length === 0) return [];
  return prisma.order.findMany({
    where: { id: { in: ranked.map((row) => row.id) } },
    orderBy: [{ placedAt: "asc" }, { id: "asc" }],
    include: BOARD_INCLUDE,
  });
}

/** How many cards each column holds in total, in one statement: the badge shows this, whatever page is loaded. */
export async function countBoardOrdersRaw(
  businessId: string,
  filters: BoardFilters = {}
): Promise<Record<BoardColumnStatus, number>> {
  const groups = await prisma.order.groupBy({
    by: ["status"],
    where: {
      businessId,
      OR: [
        { status: { in: ["PENDING", "PREPARING", "READY"] } },
        { status: "DELIVERED", placedAt: { gte: new Date(Date.now() - RECENT_WINDOW_MS) } },
      ],
      ...(filters.orderType ? { type: filters.orderType } : {}),
      ...(filters.tableId ? { tableId: filters.tableId } : {}),
    },
    _count: { _all: true },
  });
  const totals: Record<BoardColumnStatus, number> = { PENDING: 0, PREPARING: 0, READY: 0, DELIVERED: 0 };
  for (const group of groups) {
    if (group.status in totals) totals[group.status as BoardColumnStatus] = group._count._all;
  }
  return totals;
}

/**
 * The cards for orders a live event named, in any status: a card that just
 * moved to DELIVERED or CANCELLED comes back so the board can move or drop it.
 * Scoped to the business and to the board's own filters, so an order the
 * current view would not show is simply absent from the result.
 */
export async function listBoardOrdersByIdsRaw(businessId: string, ids: string[], filters: BoardFilters = {}) {
  return prisma.order.findMany({
    where: {
      businessId,
      id: { in: ids },
      ...(filters.orderType ? { type: filters.orderType } : {}),
      ...(filters.tableId ? { tableId: filters.tableId } : {}),
    },
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
          stripeAccountId: true,
          refunds: { select: { status: true, amount: true } },
        },
      },
    },
  });
}

/**
 * The review form's own read: just enough to decide whether to show the
 * form (status is DELIVERED, no Testimonial exists for this order yet) and
 * to freeze authorName at submit time. Same publicToken-is-the-auth model as
 * getOrderByPublicToken below, kept separate because that one over-fetches
 * (items, payments) for a page that only ever needs a name and a status.
 */
export async function getOrderForReviewByPublicToken(businessId: string, publicToken: string) {
  return prisma.order.findFirst({
    where: { businessId, publicToken },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      guestName: true,
      locale: true,
      customer: { select: { name: true } },
      testimonials: { select: { id: true } },
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
