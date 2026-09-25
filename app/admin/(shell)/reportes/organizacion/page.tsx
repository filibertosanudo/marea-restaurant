import Link from "next/link";
import { redirect } from "next/navigation";
import { UserRole } from "@/lib/generated/prisma/client";
import { requirePageRole } from "@/lib/auth/permissions";
import { getAdminLang } from "@/lib/i18n/cookie";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { formatMoney } from "@/lib/dto/money";
import { loadOrganizationReport } from "@/lib/reports/organization";
import type { ReportRangeKey } from "@/lib/reports/date-range";

type SearchParams = { range?: string };

const RANGE_KEYS = ["today", "yesterday", "7d", "month"] as const satisfies readonly ReportRangeKey[];
type OrgRangeKey = (typeof RANGE_KEYS)[number];

function isRangeKey(value: string | undefined): value is OrgRangeKey {
  return (RANGE_KEYS as readonly string[]).includes(value ?? "");
}

function formatDelta(pct: number | null): string {
  if (pct === null) return "—";
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

export default async function OrganizationReportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requirePageRole("/admin/menu", UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN);
  // The chain-wide view is for the chain's owner; a BUSINESS_ADMIN of one
  // branch has the ordinary report.
  if (!session.user.orgAdmin) redirect("/admin/reportes");

  const params = await searchParams;
  const key: OrgRangeKey = isRangeKey(params.range) ? params.range : "today";
  const lang = await getAdminLang();
  const dict = getDictionary(lang).reports;
  const report = await loadOrganizationReport(session.user.id, key);

  const th = "px-md py-[10px] text-[11px] font-medium uppercase tracking-[0.04em] text-on-surface-muted";
  const td = "px-md py-[8px]";
  const rangeLabels: Record<OrgRangeKey, string> = {
    today: dict.rangeToday,
    yesterday: dict.rangeYesterday,
    "7d": dict.range7d,
    month: dict.rangeMonth,
  };

  return (
    <div className="flex flex-col gap-md p-lg">
      <div className="flex flex-wrap items-center justify-between gap-md">
        <h1 className="font-display text-[22px] font-semibold text-on-surface">{dict.orgTitle}</h1>
        <Link href="/admin/reportes" className="text-[12.5px] font-medium text-primary hover:underline">
          {dict.orgBack}
        </Link>
      </div>

      <div className="flex gap-[4px] self-start rounded-full border border-border bg-surface-subtle p-[3px]">
        {RANGE_KEYS.map((option) => (
          <Link
            key={option}
            href={`/admin/reportes/organizacion?range=${option}`}
            className={`rounded-full px-md py-[6px] text-[12.5px] font-medium transition-colors ${
              option === key ? "bg-primary text-on-primary" : "text-on-surface-muted hover:bg-surface"
            }`}
          >
            {rangeLabels[option]}
          </Link>
        ))}
      </div>

      {report.branches.length === 0 ? (
        <p className="text-[13px] text-on-surface-muted">{dict.orgEmpty}</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="bg-surface-subtle">
                <th className={th}>{dict.orgColBranch}</th>
                <th className={`${th} text-right`}>{dict.orgColNetSales}</th>
                <th className={`${th} text-right`}>{dict.orgColOrders}</th>
                <th className={`${th} text-right`}>{dict.orgColAverageTicket}</th>
                <th className={`${th} text-right`}>{dict.orgColVsPrevious}</th>
              </tr>
            </thead>
            <tbody>
              {report.branches.map((branch) => (
                <tr key={branch.businessId} className="border-t border-border">
                  <td className={`${td} text-on-surface`}>{branch.name}</td>
                  <td className={`${td} text-right tabular-nums`}>{formatMoney(branch.netSales, branch.currency, lang)}</td>
                  <td className={`${td} text-right tabular-nums`}>{branch.orderCount}</td>
                  <td className={`${td} text-right tabular-nums`}>{formatMoney(branch.averageTicket, branch.currency, lang)}</td>
                  <td className={`${td} text-right tabular-nums text-on-surface-muted`}>{formatDelta(branch.netSalesDeltaPct)}</td>
                </tr>
              ))}
            </tbody>
            {report.total && (
              <tfoot>
                <tr className="border-t border-border bg-surface-subtle font-semibold">
                  <td className={`${td} text-on-surface`}>{dict.orgTotal}</td>
                  <td className={`${td} text-right tabular-nums`}>{formatMoney(report.total.netSales, report.total.currency, lang)}</td>
                  <td className={`${td} text-right tabular-nums`}>{report.total.orderCount}</td>
                  <td className={`${td} text-right tabular-nums`}>{formatMoney(report.total.averageTicket, report.total.currency, lang)}</td>
                  <td className={`${td} text-right tabular-nums text-on-surface-muted`}>{formatDelta(report.total.netSalesDeltaPct)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {!report.total && report.branches.length > 0 && (
        <p className="text-[12.5px] text-on-surface-muted">{dict.orgMixedCurrency}</p>
      )}
    </div>
  );
}
