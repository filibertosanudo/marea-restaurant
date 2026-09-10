import { describe, it, expect } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  wasOrderPaid,
  isSoldOrder,
  buildSalesSummary,
  buildSalesComparison,
  buildDailySales,
  buildPaymentMethodBreakdown,
  buildOrderTypeBreakdown,
  buildDishBreakdown,
  buildStaffBreakdown,
  buildCancellations,
  type ReportOrderRow,
  type ReportRefundRow,
} from "./aggregate";

const amount = (v: string) => new Prisma.Decimal(v);
const TIMEZONE = "America/Hermosillo"; // UTC-7 year-round

function makeOrder(overrides: Partial<ReportOrderRow> = {}): ReportOrderRow {
  // Defaults to a fully-paid order matching whatever `total` the caller
  // passes, so overriding just `total` never accidentally produces an
  // order that reads as unpaid — a test that wants a partial payment
  // overrides `payments` itself instead.
  const total = overrides.total ?? amount("100.00");
  return {
    id: `order-${Math.random()}`,
    orderNumber: "A-0001",
    total,
    status: "DELIVERED",
    type: "DINE_IN",
    placedAt: new Date("2026-03-10T20:00:00Z"), // 13:00 local
    staffId: null,
    staffName: null,
    cancellationReason: null,
    cancelledByName: null,
    items: [],
    payments: [{ status: "SUCCEEDED", amount: total, provider: "CASH_REGISTER", collectedByUserId: null }],
    ...overrides,
  };
}

function makeRefund(overrides: Partial<ReportRefundRow> = {}): ReportRefundRow {
  return {
    orderNumber: "A-0001",
    amount: amount("10.00"),
    reason: "test",
    processedAt: new Date("2026-03-10T20:00:00Z"),
    createdByName: "Rosa",
    ...overrides,
  };
}

describe("wasOrderPaid", () => {
  it("is true once SUCCEEDED payments cover the total", () => {
    const order = makeOrder({ total: amount("50.00"), payments: [{ status: "SUCCEEDED", amount: amount("50.00"), provider: "STRIPE", collectedByUserId: null }] });
    expect(wasOrderPaid(order)).toBe(true);
  });

  it("is false while payments only partially cover the total", () => {
    const order = makeOrder({ total: amount("50.00"), payments: [{ status: "SUCCEEDED", amount: amount("20.00"), provider: "STRIPE", collectedByUserId: null }] });
    expect(wasOrderPaid(order)).toBe(false);
  });

  it("ignores a PENDING payment — a pay-at-counter order that hasn't been collected isn't money yet", () => {
    const order = makeOrder({ total: amount("50.00"), payments: [{ status: "PENDING", amount: amount("50.00"), provider: "CASH_REGISTER", collectedByUserId: null }] });
    expect(wasOrderPaid(order)).toBe(false);
  });

  it("stays true once the payment's status has moved to REFUNDED — a refund doesn't erase the original sale", () => {
    // refund-actions.ts moves Payment.status itself to REFUNDED/PARTIALLY_REFUNDED
    // the moment a refund is processed (the state machine forbids going back to
    // SUCCEEDED) — this is the real shape a refunded order has in production,
    // not a payment that's still sitting at SUCCEEDED.
    const order = makeOrder({
      total: amount("50.00"),
      payments: [{ status: "REFUNDED", amount: amount("50.00"), provider: "STRIPE", collectedByUserId: null }],
    });
    expect(wasOrderPaid(order)).toBe(true);
  });

  it("stays true for a payment moved to PARTIALLY_REFUNDED", () => {
    const order = makeOrder({
      total: amount("50.00"),
      payments: [{ status: "PARTIALLY_REFUNDED", amount: amount("50.00"), provider: "CASH_REGISTER", collectedByUserId: null }],
    });
    expect(wasOrderPaid(order)).toBe(true);
  });
});

describe("isSoldOrder", () => {
  it("is false for a cancelled order even if it was paid", () => {
    const order = makeOrder({ status: "CANCELLED" });
    expect(isSoldOrder(order)).toBe(false);
  });
});

describe("buildSalesSummary", () => {
  it("sums the frozen order total for sold orders, never recalculating from items", () => {
    const orders = [
      makeOrder({ total: amount("100.00") }),
      makeOrder({ total: amount("250.50") }),
    ];
    const summary = buildSalesSummary(orders, []);
    expect(summary.grossSales.toString()).toBe("350.5");
    expect(summary.orderCount).toBe(2);
    expect(summary.averageTicket.toString()).toBe("175.25");
  });

  it("excludes a cancelled order from sales but doesn't error on it", () => {
    const orders = [makeOrder({ total: amount("100.00") }), makeOrder({ status: "CANCELLED", total: amount("999.00") })];
    const summary = buildSalesSummary(orders, []);
    expect(summary.grossSales.toString()).toBe("100");
    expect(summary.orderCount).toBe(1);
  });

  it("subtracts refunds from net sales without touching gross sales", () => {
    const orders = [makeOrder({ total: amount("100.00") })];
    const refunds = [makeRefund({ amount: amount("30.00") })];
    const summary = buildSalesSummary(orders, refunds);
    expect(summary.grossSales.toString()).toBe("100");
    expect(summary.refundsIssued.toString()).toBe("30");
    expect(summary.netSales.toString()).toBe("70");
  });

  it("is zero, not NaN or a division error, with no sold orders", () => {
    const summary = buildSalesSummary([], []);
    expect(summary.orderCount).toBe(0);
    expect(summary.averageTicket.toString()).toBe("0");
  });
});

describe("buildSalesComparison", () => {
  it("computes a percent delta against the comparison period", () => {
    const current = [makeOrder({ total: amount("150.00") })];
    const previous = [makeOrder({ total: amount("100.00") })];
    const comparison = buildSalesComparison(current, [], previous, []);
    expect(comparison.netSalesDeltaPct).toBeCloseTo(50, 5);
  });

  it("returns null (not Infinity) when the comparison period had zero sales", () => {
    const current = [makeOrder({ total: amount("150.00") })];
    const comparison = buildSalesComparison(current, [], [], []);
    expect(comparison.netSalesDeltaPct).toBeNull();
  });

  it("reports a refund on a prior order as this period's net-sales drag, without moving the order's own period", () => {
    // The order was placed (and counted as a sale) in the "previous" bucket
    // passed here, but its refund is passed as a CURRENT-period refund —
    // exactly the cross-period shape buildSalesSummary is handed in
    // production once queries.ts buckets by placedAt vs. processedAt.
    const septemberOrder = [makeOrder({ total: amount("200.00") })];
    const octoberRefundOfSeptemberOrder = [makeRefund({ amount: amount("200.00") })];
    const comparison = buildSalesComparison([], octoberRefundOfSeptemberOrder, septemberOrder, []);
    expect(comparison.previous.netSales.toString()).toBe("200"); // September untouched
    expect(comparison.current.netSales.toString()).toBe("-200"); // October absorbs the hit
  });
});

describe("buildDailySales", () => {
  it("fills every day in the window with $0, not a gap, when nothing sold", () => {
    const chartStart = new Date("2026-03-04T07:00:00Z");
    const chartEnd = new Date("2026-03-11T07:00:00Z"); // 7 local days
    const points = buildDailySales([], chartStart, chartEnd, TIMEZONE);
    expect(points).toHaveLength(7);
    expect(points.every((p) => p.total.toString() === "0")).toBe(true);
  });

  it("buckets a sold order into its own business-local calendar day", () => {
    const chartStart = new Date("2026-03-04T07:00:00Z");
    const chartEnd = new Date("2026-03-11T07:00:00Z");
    const order = makeOrder({ total: amount("42.00"), placedAt: new Date("2026-03-10T20:00:00Z") }); // 13:00 local on the 10th
    const points = buildDailySales([order], chartStart, chartEnd, TIMEZONE);
    const day10 = points.find((p) => p.date.day === 10)!;
    expect(day10.total.toString()).toBe("42");
  });

  it("excludes a cancelled order from the chart", () => {
    const chartStart = new Date("2026-03-04T07:00:00Z");
    const chartEnd = new Date("2026-03-11T07:00:00Z");
    const order = makeOrder({ status: "CANCELLED", total: amount("42.00"), placedAt: new Date("2026-03-10T20:00:00Z") });
    const points = buildDailySales([order], chartStart, chartEnd, TIMEZONE);
    expect(points.every((p) => p.total.toString() === "0")).toBe(true);
  });
});

describe("buildPaymentMethodBreakdown", () => {
  it("splits succeeded payments into cash and card", () => {
    const orders = [
      makeOrder({ payments: [{ status: "SUCCEEDED", amount: amount("50.00"), provider: "CASH_REGISTER", collectedByUserId: null }] }),
      makeOrder({ payments: [{ status: "SUCCEEDED", amount: amount("30.00"), provider: "STRIPE", collectedByUserId: null }] }),
      makeOrder({ payments: [{ status: "PENDING", amount: amount("999.00"), provider: "CASH_REGISTER", collectedByUserId: null }] }),
    ];
    const breakdown = buildPaymentMethodBreakdown(orders);
    expect(breakdown.cash.toString()).toBe("50");
    expect(breakdown.card.toString()).toBe("30");
  });

  it("ignores payments on a cancelled order", () => {
    const orders = [makeOrder({ status: "CANCELLED" })];
    const breakdown = buildPaymentMethodBreakdown(orders);
    expect(breakdown.cash.toString()).toBe("0");
  });

  it("still counts a payment later refunded — the cash physically sat in the drawer that day regardless of a later refund", () => {
    const orders = [
      makeOrder({ payments: [{ status: "REFUNDED", amount: amount("50.00"), provider: "CASH_REGISTER", collectedByUserId: null }] }),
    ];
    const breakdown = buildPaymentMethodBreakdown(orders);
    expect(breakdown.cash.toString()).toBe("50");
  });
});

describe("buildOrderTypeBreakdown", () => {
  it("buckets everything that isn't DINE_IN as takeaway", () => {
    const orders = [makeOrder({ type: "DINE_IN" }), makeOrder({ type: "TAKEAWAY" }), makeOrder({ type: "PICKUP" })];
    expect(buildOrderTypeBreakdown(orders)).toEqual({ dineIn: 1, takeaway: 2 });
  });
});

describe("buildDishBreakdown", () => {
  it("ranks by-units and by-revenue independently — the top seller isn't always the top earner", () => {
    const orders = [
      makeOrder({
        items: [
          { menuItemId: "m1", nameSnapshot: "Camarones", quantity: 9, lineTotal: amount("450.00") },
          { menuItemId: "m2", nameSnapshot: "Langosta", quantity: 2, lineTotal: amount("900.00") },
        ],
      }),
    ];
    const { byUnits, byRevenue } = buildDishBreakdown(orders);
    expect(byUnits[0].name).toBe("Camarones"); // 9 units beats 2
    expect(byRevenue[0].name).toBe("Langosta"); // $900 beats $450
  });

  it("merges the same dish across multiple orders", () => {
    const orders = [
      makeOrder({ items: [{ menuItemId: "m1", nameSnapshot: "Ceviche", quantity: 2, lineTotal: amount("200.00") }] }),
      makeOrder({ items: [{ menuItemId: "m1", nameSnapshot: "Ceviche", quantity: 3, lineTotal: amount("300.00") }] }),
    ];
    const { byUnits } = buildDishBreakdown(orders);
    expect(byUnits).toHaveLength(1);
    expect(byUnits[0].units).toBe(5);
    expect(byUnits[0].revenue.toString()).toBe("500");
  });
});

describe("buildStaffBreakdown", () => {
  it("counts orders attended by staffId and cash collected by collectedByUserId separately", () => {
    const orders = [
      makeOrder({
        staffId: "u-waiter",
        total: amount("80.00"),
        payments: [{ status: "SUCCEEDED", amount: amount("80.00"), provider: "CASH_REGISTER", collectedByUserId: "u-cashier" }],
      }),
    ];
    const rows = buildStaffBreakdown(orders, new Map([["u-cashier", "Julián"]]));
    const waiter = rows.find((r) => r.userId === "u-waiter")!;
    const cashier = rows.find((r) => r.userId === "u-cashier")!;
    expect(waiter.ordersAttended).toBe(1);
    expect(waiter.cashCollected.toString()).toBe("0");
    expect(cashier.name).toBe("Julián");
    expect(cashier.cashCollected.toString()).toBe("80");
    expect(cashier.ordersAttended).toBe(0);
  });

  it("still credits cash collected once the payment is later refunded", () => {
    const orders = [
      makeOrder({
        total: amount("80.00"),
        payments: [{ status: "PARTIALLY_REFUNDED", amount: amount("80.00"), provider: "CASH_REGISTER", collectedByUserId: "u-cashier" }],
      }),
    ];
    const rows = buildStaffBreakdown(orders, new Map([["u-cashier", "Julián"]]));
    expect(rows.find((r) => r.userId === "u-cashier")!.cashCollected.toString()).toBe("80");
  });
});

describe("buildCancellations", () => {
  it("lists cancelled orders with their reason and author, never as a sale", () => {
    const orders = [
      makeOrder({ status: "CANCELLED", cancellationReason: "cliente se arrepintió", cancelledByName: "Rosa", total: amount("310.00") }),
      makeOrder(),
    ];
    const rows = buildCancellations(orders);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reason: "cliente se arrepintió", byName: "Rosa", amount: expect.any(Prisma.Decimal) });
  });
});
