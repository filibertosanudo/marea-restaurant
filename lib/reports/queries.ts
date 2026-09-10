import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { ResolvedReportRange } from "@/lib/reports/date-range";
import type { ReportOrderRow, ReportRefundRow } from "@/lib/reports/aggregate";

const ORDER_SELECT = {
  id: true,
  orderNumber: true,
  total: true,
  status: true,
  type: true,
  placedAt: true,
  staffId: true,
  cancellationReason: true,
  staff: { select: { name: true } },
  items: { select: { menuItemId: true, nameSnapshot: true, quantity: true, lineTotal: true } },
  payments: { select: { status: true, amount: true, provider: true, collectedByUserId: true } },
  // Last CANCELLED transition, if any — Order has no cancelledById column of
  // its own; the author of a cancellation only ever lives in the status
  // history (see schema.prisma's own comment on OrderStatusEvent).
  statusEvents: {
    where: { toStatus: "CANCELLED" as const },
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: { changedBy: { select: { name: true } } },
  },
} satisfies Prisma.OrderSelect;

async function listOrdersForReportRaw(businessId: string, start: Date, end: Date): Promise<ReportOrderRow[]> {
  const orders = await prisma.order.findMany({
    where: { businessId, placedAt: { gte: start, lt: end } },
    select: ORDER_SELECT,
  });
  return orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    total: order.total,
    status: order.status,
    type: order.type,
    placedAt: order.placedAt,
    staffId: order.staffId,
    staffName: order.staff?.name ?? null,
    cancellationReason: order.cancellationReason,
    cancelledByName: order.statusEvents[0]?.changedBy?.name ?? null,
    items: order.items,
    payments: order.payments,
  }));
}

async function listSucceededRefundsRaw(businessId: string, start: Date, end: Date): Promise<ReportRefundRow[]> {
  const refunds = await prisma.refund.findMany({
    where: { status: "SUCCEEDED", processedAt: { gte: start, lt: end }, payment: { businessId } },
    select: {
      amount: true,
      reason: true,
      processedAt: true,
      createdBy: { select: { name: true } },
      payment: { select: { order: { select: { orderNumber: true } } } },
    },
  });
  return refunds.map((refund) => ({
    orderNumber: refund.payment.order.orderNumber,
    amount: refund.amount,
    // Filtered on this same field above (`gte`/`lt`) — a null couldn't have matched, so this is always set.
    processedAt: refund.processedAt!,
    reason: refund.reason,
    createdByName: refund.createdBy?.name ?? null,
  }));
}

/**
 * `Payment.collectedByUserId` has no declared Prisma relation (see
 * schema.prisma), so the collecting employee's name can't come from an
 * `include` — resolved here as a second, tiny query instead of adding an FK
 * relation as a side effect of a reports module. A real relation is a
 * schema change, and this module's only sanctioned one is phase 3's.
 */
async function listUserNamesByIdRaw(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(users.map((user) => [user.id, user.name ?? user.id]));
}

export type SalesReportRawData = {
  /** Every order placed in [min(range.start, range.chartStart), range.end) — a superset covering both the period totals and the trailing-7-day chart, fetched once. */
  chartOrders: ReportOrderRow[];
  currentOrders: ReportOrderRow[];
  currentRefunds: ReportRefundRow[];
  previousOrders: ReportOrderRow[];
  previousRefunds: ReportRefundRow[];
  collectorNames: Map<string, string>;
};

/**
 * One entry point for every query the sales report needs. The chart window
 * and the period window overlap however the selected range happens to line
 * up (a 1-day range's chart runs 6 days before it; a full month's chart
 * sits inside it) — rather than reason about that per range key, this
 * fetches the union window once and lets lib/reports/aggregate.ts's pure
 * functions filter each figure to the window it actually needs.
 */
export async function loadSalesReportRawData(businessId: string, range: ResolvedReportRange): Promise<SalesReportRawData> {
  const unionStart = range.start < range.chartStart ? range.start : range.chartStart;

  const [chartOrders, previousOrders, previousRefunds, currentRefunds] = await Promise.all([
    listOrdersForReportRaw(businessId, unionStart, range.end),
    listOrdersForReportRaw(businessId, range.comparisonStart, range.comparisonEnd),
    listSucceededRefundsRaw(businessId, range.comparisonStart, range.comparisonEnd),
    listSucceededRefundsRaw(businessId, range.start, range.end),
  ]);

  const currentOrders = chartOrders.filter((o) => o.placedAt >= range.start && o.placedAt < range.end);

  const collectorIds = new Set<string>();
  for (const order of currentOrders) {
    for (const payment of order.payments) {
      if (payment.collectedByUserId) collectorIds.add(payment.collectedByUserId);
    }
  }
  const collectorNames = await listUserNamesByIdRaw([...collectorIds]);

  return { chartOrders, currentOrders, currentRefunds, previousOrders, previousRefunds, collectorNames };
}
