import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { loadSalesReportRawData } from "./queries";
import { toSalesReportDTO } from "@/lib/dto/reports";
import { resolveReportRange } from "./date-range";
import { makeBusiness, makeOrder, makeStaff } from "@/test/factories";

const TIMEZONE = "America/Hermosillo"; // UTC-7 year-round
// 2026-03-10 20:00 UTC = 2026-03-10 13:00 local.
const NOW = new Date("2026-03-10T20:00:00Z");

function makeCurrentBusiness(overrides: Record<string, unknown> = {}) {
  return makeBusiness({ slug: "marea", timezone: TIMEZONE, currency: "MXN", ...overrides });
}

async function seedSoldOrder(
  businessId: string,
  opts: { total: string; placedAt: Date; staffId?: string; itemName?: string; itemQty?: number; itemTotal?: string; collectedByUserId?: string }
) {
  const order = await makeOrder(businessId, {
    total: opts.total,
    placedAt: opts.placedAt,
    status: "DELIVERED",
    staffId: opts.staffId,
  });
  await prisma.orderItem.create({
    data: {
      orderId: order.id,
      nameSnapshot: opts.itemName ?? "Ceviche",
      unitPrice: opts.itemTotal ?? opts.total,
      quantity: opts.itemQty ?? 1,
      lineTotal: opts.itemTotal ?? opts.total,
    },
  });
  await prisma.payment.create({
    data: {
      businessId,
      orderId: order.id,
      provider: "CASH_REGISTER",
      status: "SUCCEEDED",
      amount: opts.total,
      paidAt: opts.placedAt,
      collectedByUserId: opts.collectedByUserId,
    },
  });
  return order;
}

describe("loadSalesReportRawData + toSalesReportDTO", () => {
  it("matches a hand-computed sum of the day's orders, to the centavo", async () => {
    const business = await makeCurrentBusiness();
    await seedSoldOrder(business.id, { total: "310.00", placedAt: new Date("2026-03-10T19:00:00Z") }); // 12:00 local
    await seedSoldOrder(business.id, { total: "89.50", placedAt: new Date("2026-03-10T22:00:00Z") }); // 15:00 local
    // Outside the day (yesterday local) — must not leak into today's sum.
    await seedSoldOrder(business.id, { total: "999.00", placedAt: new Date("2026-03-09T12:00:00Z") });

    const range = resolveReportRange("today", business.timezone, NOW);
    const raw = await loadSalesReportRawData(business.id, range);
    const report = toSalesReportDTO(raw, range, business.timezone);

    // Hand-computed: 310.00 + 89.50 = 399.50
    expect(report.summary.grossSales).toBe("399.50");
    expect(report.summary.orderCount).toBe(2);
  });

  it("excludes a cancelled order from sales and lists it in cancellations instead", async () => {
    const business = await makeCurrentBusiness();
    const staff = await makeStaff("STAFF");
    const sold = await seedSoldOrder(business.id, { total: "100.00", placedAt: new Date("2026-03-10T19:00:00Z") });
    const cancelled = await makeOrder(business.id, {
      total: "250.00",
      placedAt: new Date("2026-03-10T19:30:00Z"),
      status: "CANCELLED",
      cancellationReason: "cliente se equivocó de sucursal",
    });
    await prisma.orderStatusEvent.create({
      data: { orderId: cancelled.id, toStatus: "CANCELLED", changedById: staff.id },
    });

    const range = resolveReportRange("today", business.timezone, NOW);
    const raw = await loadSalesReportRawData(business.id, range);
    const report = toSalesReportDTO(raw, range, business.timezone);

    expect(report.summary.grossSales).toBe("100.00");
    expect(report.summary.orderCount).toBe(1);
    expect(report.cancellations).toHaveLength(1);
    expect(report.cancellations[0]).toMatchObject({
      orderNumber: cancelled.orderNumber,
      reason: "cliente se equivocó de sucursal",
      byName: staff.name,
      amount: "250.00",
    });
    void sold;
  });

  it("does not count a PENDING pay-at-counter order as a sale", async () => {
    const business = await makeCurrentBusiness();
    const order = await makeOrder(business.id, { total: "150.00", placedAt: new Date("2026-03-10T19:00:00Z") });
    await prisma.payment.create({
      data: { businessId: business.id, orderId: order.id, provider: "CASH_REGISTER", status: "PENDING", amount: "150.00" },
    });

    const range = resolveReportRange("today", business.timezone, NOW);
    const raw = await loadSalesReportRawData(business.id, range);
    const report = toSalesReportDTO(raw, range, business.timezone);

    expect(report.summary.orderCount).toBe(0);
    expect(report.summary.grossSales).toBe("0.00");
  });

  it("subtracts a refund from the period it was ISSUED, not the period of the original order", async () => {
    const business = await makeCurrentBusiness();
    // Order placed and paid on 2026-02-10 (last month).
    const septemberOrder = await seedSoldOrder(business.id, { total: "200.00", placedAt: new Date("2026-02-10T19:00:00Z") });
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: septemberOrder.id } });
    // Refund processed on 2026-03-10 (this month, "today" for NOW). A real
    // refund also moves the payment's own status off SUCCEEDED (see
    // lib/payments/refund-actions.ts) — reproduced here so this test
    // exercises the same shape production data actually has.
    await prisma.refund.create({
      data: {
        paymentId: payment.id,
        amount: "200.00",
        status: "SUCCEEDED",
        reason: "producto repetido",
        processedAt: new Date("2026-03-10T19:00:00Z"),
      },
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } });

    const todayRange = resolveReportRange("today", business.timezone, NOW);
    const todayRaw = await loadSalesReportRawData(business.id, todayRange);
    const todayReport = toSalesReportDTO(todayRaw, todayRange, business.timezone);

    // "today" (March 10) has no orders of its own, but absorbs the refund.
    expect(todayReport.summary.orderCount).toBe(0);
    expect(todayReport.summary.refundsIssued).toBe("200.00");
    expect(todayReport.summary.netSales).toBe("-200.00");
    expect(todayReport.refunds).toHaveLength(1);

    // February's own report is untouched by a refund issued in March.
    const febRange = resolveReportRange("custom", business.timezone, NOW, {
      from: { year: 2026, month: 2, day: 10 },
      to: { year: 2026, month: 2, day: 10 },
    });
    const febRaw = await loadSalesReportRawData(business.id, febRange);
    const febReport = toSalesReportDTO(febRaw, febRange, business.timezone);
    expect(febReport.summary.grossSales).toBe("200.00");
    expect(febReport.summary.netSales).toBe("200.00");
    expect(febReport.summary.refundsIssued).toBe("0.00");
  });

  it("attributes orders attended and cash collected to the right employee", async () => {
    const business = await makeCurrentBusiness();
    const waiter = await makeStaff("STAFF", { name: "Rosa Elena Cruz" });
    const cashier = await makeStaff("STAFF", { name: "Julián Bravo" });
    await seedSoldOrder(business.id, {
      total: "120.00",
      placedAt: new Date("2026-03-10T19:00:00Z"),
      staffId: waiter.id,
      collectedByUserId: cashier.id,
    });

    const range = resolveReportRange("today", business.timezone, NOW);
    const raw = await loadSalesReportRawData(business.id, range);
    const report = toSalesReportDTO(raw, range, business.timezone);

    expect(report.staff).toHaveLength(2);
    const waiterRow = report.staff.find((s) => s.userId === waiter.id)!;
    const cashierRow = report.staff.find((s) => s.userId === cashier.id)!;
    expect(waiterRow.ordersAttended).toBe(1);
    expect(cashierRow.cashCollected).toBe("120.00");
    expect(cashierRow.name).toBe(cashier.name);
  });

  it("moves the day cut when Business.timezone changes", async () => {
    const business = await makeCurrentBusiness({ timezone: "America/Hermosillo" }); // UTC-7
    // 2026-03-11 01:30 UTC is 2026-03-10 18:30 in Hermosillo (still "today")
    // but already 2026-03-10 19:30 in Mexico City (UTC-6) — same instant,
    // still the 10th in both here, so pick one that actually straddles:
    // 2026-03-11 06:30 UTC = 2026-03-10 23:30 Hermosillo (still the 10th),
    // = 2026-03-11 00:30 Mexico City (already the 11th).
    const straddlingInstant = new Date("2026-03-11T06:30:00Z");
    await seedSoldOrder(business.id, { total: "77.00", placedAt: straddlingInstant });

    const hermosilloRange = resolveReportRange("today", "America/Hermosillo", NOW);
    const hermosilloRaw = await loadSalesReportRawData(business.id, hermosilloRange);
    const hermosilloReport = toSalesReportDTO(hermosilloRaw, hermosilloRange, "America/Hermosillo");
    expect(hermosilloReport.summary.grossSales).toBe("77.00");

    const mexicoCityRange = resolveReportRange("today", "America/Mexico_City", NOW);
    const mexicoCityRaw = await loadSalesReportRawData(business.id, mexicoCityRange);
    const mexicoCityReport = toSalesReportDTO(mexicoCityRaw, mexicoCityRange, "America/Mexico_City");
    // In Mexico City the same order already landed on the 11th, so it falls
    // outside "today" (still the 10th at NOW) and outside the report entirely.
    expect(mexicoCityReport.summary.grossSales).toBe("0.00");
  });
});
