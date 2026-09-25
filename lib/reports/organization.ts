import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { listOrganizationBusinesses } from "@/lib/auth/business-access";
import { runInTenant } from "@/lib/tenancy/context";
import { resolveReportRange, type ReportRangeKey } from "@/lib/reports/date-range";
import { loadSalesReportRawData } from "@/lib/reports/queries";
import { toSalesReportDTO } from "@/lib/dto/reports";

export type BranchSummary = {
  businessId: string;
  name: string;
  currency: string;
  netSales: string;
  orderCount: number;
  averageTicket: string;
  previousNetSales: string;
  netSalesDeltaPct: number | null;
};

export type OrganizationReport = {
  branches: BranchSummary[];
  /** Null when the branches bill in more than one currency: adding them would be meaningless. */
  total: {
    currency: string;
    netSales: string;
    orderCount: number;
    averageTicket: string;
    previousNetSales: string;
    netSalesDeltaPct: number | null;
  } | null;
};

const money = (value: Prisma.Decimal) => value.toDecimalPlaces(2).toFixed(2);

/**
 * The sales of every branch of the caller's organization, side by side, from the
 * same aggregation the single-business report uses (lib/reports/aggregate.ts):
 * no second implementation to drift.
 *
 * Row level security stays exactly as it is. There is no role that sees several
 * businesses at once; this runs the ordinary report once per branch, each time
 * inside that branch's own scope, and adds the summaries up. The branches are
 * the ones authorizeBusiness allows this user (lib/auth/business-access.ts),
 * so an organization's report can only ever name its own.
 *
 * SEQUENTIAL ON PURPOSE, one branch after another: three branches cost three
 * times one report, which is nothing. The cost is linear in the number of
 * branches, so it is worth revisiting at around fifty (run them in parallel
 * with a small pool, or precompute a daily summary table as module 12 did).
 */
export async function loadOrganizationReport(
  userId: string,
  key: Exclude<ReportRangeKey, "custom">,
  now: Date = new Date()
): Promise<OrganizationReport> {
  const branches: BranchSummary[] = [];
  let previousTotals: Prisma.Decimal[] = [];

  for (const { id, name } of await listOrganizationBusinesses(userId)) {
    const summary = await runInTenant(id, async () => {
      const business = await prisma.business.findUniqueOrThrow({
        where: { id },
        select: { currency: true, timezone: true },
      });
      const range = resolveReportRange(key, business.timezone, now);
      const report = toSalesReportDTO(await loadSalesReportRawData(id, range), range, business.timezone);
      return { business, report };
    });

    branches.push({
      businessId: id,
      name,
      currency: summary.business.currency,
      netSales: summary.report.summary.netSales,
      orderCount: summary.report.summary.orderCount,
      averageTicket: summary.report.summary.averageTicket,
      previousNetSales: summary.report.summary.previous.netSales,
      netSalesDeltaPct: summary.report.summary.netSalesDeltaPct,
    });
    previousTotals = [...previousTotals, new Prisma.Decimal(summary.report.summary.previous.netSales)];
  }

  const currencies = new Set(branches.map((b) => b.currency));
  if (branches.length === 0 || currencies.size > 1) return { branches, total: null };

  const netSales = branches.reduce((sum, b) => sum.add(b.netSales), new Prisma.Decimal(0));
  const previous = previousTotals.reduce((sum, value) => sum.add(value), new Prisma.Decimal(0));
  const orderCount = branches.reduce((sum, b) => sum + b.orderCount, 0);

  return {
    branches,
    total: {
      currency: [...currencies][0],
      netSales: money(netSales),
      orderCount,
      averageTicket: orderCount === 0 ? "0.00" : money(netSales.div(orderCount)),
      previousNetSales: money(previous),
      netSalesDeltaPct: previous.isZero() ? null : Number(netSales.sub(previous).div(previous).mul(100).toFixed(1)),
    },
  };
}
