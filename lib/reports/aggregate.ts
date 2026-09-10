import { Prisma } from "@/lib/generated/prisma/client";
import type { OrderStatus, OrderType, PaymentProvider, PaymentStatus } from "@/lib/generated/prisma/client";
import { businessLocalDateParts } from "@/lib/reservations/availability";
import { addDays, type CalendarDate } from "@/lib/reports/date-range";
import { wasEverSuccessful, sumEverSucceededPayments } from "@/lib/payments/summary";

/**
 * Plain shapes, not Prisma's generated types — same reasoning as
 * lib/reservations/availability.ts: this module is pure and framework-free
 * so every figure in the report can be unit-tested against hand-built rows
 * without a database.
 */
export type ReportPaymentRow = {
  status: PaymentStatus;
  amount: Prisma.Decimal;
  provider: PaymentProvider;
  collectedByUserId: string | null;
};

export type ReportOrderItemRow = {
  menuItemId: string | null;
  nameSnapshot: string;
  quantity: number;
  lineTotal: Prisma.Decimal;
};

export type ReportOrderRow = {
  id: string;
  orderNumber: string;
  total: Prisma.Decimal;
  status: OrderStatus;
  type: OrderType;
  placedAt: Date;
  staffId: string | null;
  staffName: string | null;
  cancellationReason: string | null;
  cancelledByName: string | null;
  items: ReportOrderItemRow[];
  payments: ReportPaymentRow[];
};

export type ReportRefundRow = {
  orderNumber: string;
  amount: Prisma.Decimal;
  reason: string | null;
  processedAt: Date;
  createdByName: string | null;
};

const ZERO = new Prisma.Decimal(0);

/**
 * Whether an order counts as a sale at all — payments that ever succeeded
 * (ignoring refunds, see lib/payments/summary.ts's wasEverSuccessful) cover
 * the full total. Deliberately NOT that same module's
 * computePaymentSummary().isSettled, which nets out refunds to answer "is
 * anything still owed right now": a fully refunded order reads as unsettled
 * there even though it was a real sale the day it was placed and paid. That
 * sale doesn't get un-counted from its original period — the refund is a
 * separate line, subtracted from whichever period it was actually issued in
 * (see buildSalesSummary).
 */
export function wasOrderPaid(order: Pick<ReportOrderRow, "payments" | "total">): boolean {
  return sumEverSucceededPayments(order.payments).gte(order.total);
}

/** A cancelled order is never a sale, paid or not — it shows in its own table instead. */
export function isSoldOrder(order: ReportOrderRow): boolean {
  return order.status !== "CANCELLED" && wasOrderPaid(order);
}

export type SalesSummary = {
  /** Sum of order.total for sold orders placed in the period — the frozen ticket amount, never recomputed from the catalog. */
  grossSales: Prisma.Decimal;
  /** grossSales minus refunds ISSUED in this period, regardless of which period the original order fell in. */
  netSales: Prisma.Decimal;
  orderCount: number;
  averageTicket: Prisma.Decimal;
  refundsIssued: Prisma.Decimal;
};

export function buildSalesSummary(orders: ReportOrderRow[], refunds: ReportRefundRow[]): SalesSummary {
  const sold = orders.filter(isSoldOrder);
  const grossSales = sold.reduce((sum, o) => sum.add(o.total), ZERO);
  const refundsIssued = refunds.reduce((sum, r) => sum.add(r.amount), ZERO);
  return {
    grossSales,
    netSales: grossSales.sub(refundsIssued),
    orderCount: sold.length,
    averageTicket: sold.length > 0 ? grossSales.div(sold.length) : ZERO,
    refundsIssued,
  };
}

/**
 * `.toNumber()` on money is banned everywhere else in this codebase because
 * summing floats loses precision a customer's ticket can't afford to lose.
 * A percentage delta between two already-final Decimal sums is neither of
 * those things — it's a display-only ratio, computed once, never re-summed
 * — so converting here is safe.
 */
function percentDelta(current: Prisma.Decimal | number, previous: Prisma.Decimal | number): number | null {
  const prev = previous instanceof Prisma.Decimal ? previous.toNumber() : previous;
  const cur = current instanceof Prisma.Decimal ? current.toNumber() : current;
  if (prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export type SalesComparison = {
  current: SalesSummary;
  previous: SalesSummary;
  netSalesDeltaPct: number | null;
  orderCountDeltaPct: number | null;
  averageTicketDeltaPct: number | null;
};

export function buildSalesComparison(
  currentOrders: ReportOrderRow[],
  currentRefunds: ReportRefundRow[],
  previousOrders: ReportOrderRow[],
  previousRefunds: ReportRefundRow[]
): SalesComparison {
  const current = buildSalesSummary(currentOrders, currentRefunds);
  const previous = buildSalesSummary(previousOrders, previousRefunds);
  return {
    current,
    previous,
    netSalesDeltaPct: percentDelta(current.netSales, previous.netSales),
    orderCountDeltaPct: percentDelta(current.orderCount, previous.orderCount),
    averageTicketDeltaPct: percentDelta(current.averageTicket, previous.averageTicket),
  };
}

export type DailySalesPoint = { date: CalendarDate; total: Prisma.Decimal };

function calendarKey(date: CalendarDate): string {
  return `${date.year}-${date.month}-${date.day}`;
}

/**
 * Always exactly the [chartStart, chartEnd) window it's given (see
 * date-range.ts: always a trailing 7 calendar days), with every day
 * present even at $0 — a day with no sales is real information ("the
 * slowest day of the week"), not a gap the chart should skip over.
 */
export function buildDailySales(
  orders: ReportOrderRow[],
  chartStart: Date,
  chartEnd: Date,
  timezone: string
): DailySalesPoint[] {
  const totals = new Map<string, Prisma.Decimal>();
  for (const order of orders) {
    if (!isSoldOrder(order)) continue;
    if (order.placedAt < chartStart || order.placedAt >= chartEnd) continue;
    const key = calendarKey(businessLocalDateParts(order.placedAt, timezone));
    totals.set(key, (totals.get(key) ?? ZERO).add(order.total));
  }

  const lastDay = businessLocalDateParts(new Date(chartEnd.getTime() - 1), timezone);
  const firstDay = businessLocalDateParts(chartStart, timezone);

  const points: DailySalesPoint[] = [];
  let cursor = firstDay;
  while (true) {
    points.push({ date: cursor, total: totals.get(calendarKey(cursor)) ?? ZERO });
    if (calendarKey(cursor) === calendarKey(lastDay)) break;
    cursor = addDays(cursor, 1);
  }
  return points;
}

export type PaymentMethodBreakdown = { cash: Prisma.Decimal; card: Prisma.Decimal };

/**
 * A payment that never succeeded (still PENDING, or FAILED/CANCELLED) isn't
 * money — but one that succeeded and was LATER refunded still did put that
 * amount in the drawer on the day it was collected, which is exactly what
 * this breakdown reconciles against (see wasEverSuccessful). Not restricted to
 * isSoldOrder — a partial cash deposit on an order that isn't fully paid
 * yet is still real money already sitting in the drawer.
 */
export function buildPaymentMethodBreakdown(orders: ReportOrderRow[]): PaymentMethodBreakdown {
  let cash = ZERO;
  let card = ZERO;
  for (const order of orders) {
    if (order.status === "CANCELLED") continue;
    for (const payment of order.payments) {
      if (!wasEverSuccessful(payment)) continue;
      if (payment.provider === "CASH_REGISTER") cash = cash.add(payment.amount);
      else card = card.add(payment.amount);
    }
  }
  return { cash, card };
}

export type OrderTypeBreakdown = { dineIn: number; takeaway: number };

export function buildOrderTypeBreakdown(orders: ReportOrderRow[]): OrderTypeBreakdown {
  let dineIn = 0;
  let takeaway = 0;
  for (const order of orders.filter(isSoldOrder)) {
    if (order.type === "DINE_IN") dineIn += 1;
    else takeaway += 1;
  }
  return { dineIn, takeaway };
}

export type DishBreakdownRow = { menuItemId: string | null; name: string; units: number; revenue: Prisma.Decimal };

/**
 * Units and revenue are deliberately two different sort orders over the
 * same rows, never one list re-labeled — the dish that sells the most
 * units is rarely the one that earns the most, and that gap is the whole
 * point of showing both.
 */
export function buildDishBreakdown(orders: ReportOrderRow[]): {
  byUnits: DishBreakdownRow[];
  byRevenue: DishBreakdownRow[];
} {
  const rows = new Map<string, DishBreakdownRow>();
  for (const order of orders.filter(isSoldOrder)) {
    for (const item of order.items) {
      const key = item.menuItemId ?? `name:${item.nameSnapshot}`;
      const existing = rows.get(key);
      if (existing) {
        existing.units += item.quantity;
        existing.revenue = existing.revenue.add(item.lineTotal);
      } else {
        rows.set(key, {
          menuItemId: item.menuItemId,
          name: item.nameSnapshot,
          units: item.quantity,
          revenue: item.lineTotal,
        });
      }
    }
  }
  const all = [...rows.values()];
  return {
    byUnits: [...all].sort((a, b) => b.units - a.units),
    byRevenue: [...all].sort((a, b) => b.revenue.comparedTo(a.revenue)),
  };
}

export type StaffBreakdownRow = { userId: string; name: string; ordersAttended: number; cashCollected: Prisma.Decimal };

/**
 * Two independent counters per employee, from two independent sources —
 * `staffId` (who attended the order) and `Payment.collectedByUserId` (who
 * physically took the cash) — because the same person usually does both
 * but the schema doesn't guarantee it, and a corte de caja cares
 * specifically about the second one.
 */
export function buildStaffBreakdown(
  orders: ReportOrderRow[],
  collectorNames: Map<string, string>
): StaffBreakdownRow[] {
  const rows = new Map<string, StaffBreakdownRow>();
  const ensure = (userId: string, name: string): StaffBreakdownRow => {
    let row = rows.get(userId);
    if (!row) {
      row = { userId, name, ordersAttended: 0, cashCollected: ZERO };
      rows.set(userId, row);
    }
    return row;
  };

  for (const order of orders) {
    if (order.status === "CANCELLED") continue;
    if (isSoldOrder(order) && order.staffId) {
      ensure(order.staffId, order.staffName ?? order.staffId).ordersAttended += 1;
    }
    for (const payment of order.payments) {
      if (wasEverSuccessful(payment) && payment.provider === "CASH_REGISTER" && payment.collectedByUserId) {
        const row = ensure(
          payment.collectedByUserId,
          collectorNames.get(payment.collectedByUserId) ?? payment.collectedByUserId
        );
        row.cashCollected = row.cashCollected.add(payment.amount);
      }
    }
  }

  return [...rows.values()].sort((a, b) => b.ordersAttended - a.ordersAttended);
}

export type CancellationRow = {
  orderId: string;
  orderNumber: string;
  reason: string | null;
  byName: string | null;
  amount: Prisma.Decimal;
};

/** Cancellations never count as sales (see isSoldOrder) but still need their own table — hiding them is exactly how a report ends up lying about a 15%-cancellation day. */
export function buildCancellations(orders: ReportOrderRow[]): CancellationRow[] {
  return orders
    .filter((o) => o.status === "CANCELLED")
    .map((o) => ({ orderId: o.id, orderNumber: o.orderNumber, reason: o.cancellationReason, byName: o.cancelledByName, amount: o.total }));
}
