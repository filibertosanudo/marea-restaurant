import { decimalToString } from "@/lib/dto/money";
import type { ResolvedReportRange, CalendarDate } from "@/lib/reports/date-range";
import type { SalesReportRawData } from "@/lib/reports/queries";
import {
  buildSalesComparison,
  buildDailySales,
  buildPaymentMethodBreakdown,
  buildOrderTypeBreakdown,
  buildDishBreakdown,
  buildStaffBreakdown,
  buildCancellations,
} from "@/lib/reports/aggregate";

export type SalesReportDTO = {
  summary: {
    grossSales: string;
    netSales: string;
    orderCount: number;
    averageTicket: string;
    refundsIssued: string;
    previous: { netSales: string; orderCount: number; averageTicket: string };
    netSalesDeltaPct: number | null;
    orderCountDeltaPct: number | null;
    averageTicketDeltaPct: number | null;
  };
  dailySales: { date: CalendarDate; total: string }[];
  paymentMethods: { cash: string; card: string };
  orderTypes: { dineIn: number; takeaway: number };
  dishesByUnits: { menuItemId: string | null; name: string; units: number; revenue: string }[];
  dishesByRevenue: { menuItemId: string | null; name: string; units: number; revenue: string }[];
  staff: { userId: string; name: string; ordersAttended: number; cashCollected: string }[];
  cancellations: { orderId: string; orderNumber: string; reason: string | null; byName: string | null; amount: string }[];
  refunds: { orderNumber: string; reason: string | null; createdByName: string | null; amount: string; processedAt: string }[];
};

/** Prisma.Decimal never crosses to a Client Component — this is the boundary, converting every money figure lib/reports/aggregate.ts computed to a fixed-2-decimal string. */
export function toSalesReportDTO(
  data: SalesReportRawData,
  range: ResolvedReportRange,
  timezone: string
): SalesReportDTO {
  const comparison = buildSalesComparison(
    data.currentOrders,
    data.currentRefunds,
    data.previousOrders,
    data.previousRefunds
  );
  const daily = buildDailySales(data.chartOrders, range.chartStart, range.chartEnd, timezone);
  const methods = buildPaymentMethodBreakdown(data.currentOrders);
  const orderTypes = buildOrderTypeBreakdown(data.currentOrders);
  const dishes = buildDishBreakdown(data.currentOrders);
  const staff = buildStaffBreakdown(data.currentOrders, data.collectorNames);
  const cancellations = buildCancellations(data.currentOrders);

  return {
    summary: {
      grossSales: decimalToString(comparison.current.grossSales)!,
      netSales: decimalToString(comparison.current.netSales)!,
      orderCount: comparison.current.orderCount,
      averageTicket: decimalToString(comparison.current.averageTicket)!,
      refundsIssued: decimalToString(comparison.current.refundsIssued)!,
      previous: {
        netSales: decimalToString(comparison.previous.netSales)!,
        orderCount: comparison.previous.orderCount,
        averageTicket: decimalToString(comparison.previous.averageTicket)!,
      },
      netSalesDeltaPct: comparison.netSalesDeltaPct,
      orderCountDeltaPct: comparison.orderCountDeltaPct,
      averageTicketDeltaPct: comparison.averageTicketDeltaPct,
    },
    dailySales: daily.map((point) => ({ date: point.date, total: decimalToString(point.total)! })),
    paymentMethods: { cash: decimalToString(methods.cash)!, card: decimalToString(methods.card)! },
    orderTypes,
    dishesByUnits: dishes.byUnits.map((d) => ({ ...d, revenue: decimalToString(d.revenue)! })),
    dishesByRevenue: dishes.byRevenue.map((d) => ({ ...d, revenue: decimalToString(d.revenue)! })),
    staff: staff.map((s) => ({ ...s, cashCollected: decimalToString(s.cashCollected)! })),
    cancellations: cancellations.map((c) => ({ ...c, amount: decimalToString(c.amount)! })),
    refunds: data.currentRefunds.map((r) => ({
      orderNumber: r.orderNumber,
      reason: r.reason,
      createdByName: r.createdByName,
      amount: decimalToString(r.amount)!,
      processedAt: r.processedAt.toISOString(),
    })),
  };
}
