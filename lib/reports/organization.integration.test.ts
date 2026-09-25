import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { loadOrganizationReport } from "./organization";
import { makeBusiness, makeOrder, makeOrgAdmin, makeOrganization, makeStaff } from "@/test/factories";

const TIMEZONE = "America/Hermosillo"; // UTC-7 year-round
// 2026-03-10 20:00 UTC = 2026-03-10 13:00 local.
const NOW = new Date("2026-03-10T20:00:00Z");
const NOON = new Date("2026-03-10T19:00:00Z");

async function sale(businessId: string, total: string) {
  const order = await makeOrder(businessId, { total, placedAt: NOON, status: "DELIVERED" });
  await prisma.orderItem.create({
    data: { orderId: order.id, nameSnapshot: "Ceviche", unitPrice: total, quantity: 1, lineTotal: total },
  });
  await prisma.payment.create({
    data: {
      businessId,
      orderId: order.id,
      provider: "CASH_REGISTER",
      status: "SUCCEEDED",
      amount: total,
      paidAt: NOON,
    },
  });
}

describe("loadOrganizationReport", () => {
  it("adds up the branches of the caller's organization and nothing from anyone else's", async () => {
    const chain = await makeOrganization();
    const other = await makeOrganization();
    const north = await makeBusiness({ slug: "north", name: "North", organizationId: chain.id, timezone: TIMEZONE, currency: "MXN" });
    const south = await makeBusiness({ slug: "south", name: "South", organizationId: chain.id, timezone: TIMEZONE, currency: "MXN" });
    const rival = await makeBusiness({ slug: "rival", name: "Rival", organizationId: other.id, timezone: TIMEZONE, currency: "MXN" });
    await sale(north.id, "310.00");
    await sale(north.id, "90.00");
    await sale(south.id, "100.50");
    await sale(rival.id, "9999.00");
    const owner = await makeOrgAdmin(chain.id);

    const report = await loadOrganizationReport(owner.id, "today", NOW);

    expect(report.branches.map((b) => [b.name, b.netSales, b.orderCount])).toEqual([
      ["North", "400.00", 2],
      ["South", "100.50", 1],
    ]);
    expect(report.total).toMatchObject({ currency: "MXN", netSales: "500.50", orderCount: 3, averageTicket: "166.83" });
  });

  it("matches the single-business report for each branch", async () => {
    const chain = await makeOrganization();
    const north = await makeBusiness({ slug: "north", name: "North", organizationId: chain.id, timezone: TIMEZONE });
    await sale(north.id, "250.00");
    const owner = await makeOrgAdmin(chain.id);

    const { loadSalesReportRawData } = await import("./queries");
    const { toSalesReportDTO } = await import("@/lib/dto/reports");
    const { resolveReportRange } = await import("./date-range");
    const range = resolveReportRange("today", TIMEZONE, NOW);
    const single = toSalesReportDTO(await loadSalesReportRawData(north.id, range), range, TIMEZONE);

    const report = await loadOrganizationReport(owner.id, "today", NOW);
    expect(report.branches[0].netSales).toBe(single.summary.netSales);
    expect(report.branches[0].orderCount).toBe(single.summary.orderCount);
  });

  it("does not add branches that bill in different currencies", async () => {
    const chain = await makeOrganization();
    await makeBusiness({ slug: "mx", organizationId: chain.id, timezone: TIMEZONE, currency: "MXN" });
    await makeBusiness({ slug: "us", organizationId: chain.id, timezone: TIMEZONE, currency: "USD" });
    const owner = await makeOrgAdmin(chain.id);

    const report = await loadOrganizationReport(owner.id, "today", NOW);

    expect(report.branches).toHaveLength(2);
    expect(report.total).toBeNull();
  });

  it("is empty for a user who administers no organization", async () => {
    await makeBusiness({ slug: "solo", timezone: TIMEZONE });
    const nobody = await makeStaff("BUSINESS_ADMIN");

    expect(await loadOrganizationReport(nobody.id, "today", NOW)).toEqual({ branches: [], total: null });
  });
});
