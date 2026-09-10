import Link from "next/link";
import { UserRole } from "@/lib/generated/prisma/client";
import { requirePageRole } from "@/lib/auth/permissions";
import { getCurrentBusiness } from "@/lib/business";
import { getAdminLang } from "@/lib/i18n/cookie";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { resolveReportRange, type ReportRangeKey, type CalendarDate } from "@/lib/reports/date-range";
import { parseRangeParams, resolvableRangeKey } from "@/lib/reports/range-params";
import { loadSalesReportRawData } from "@/lib/reports/queries";
import { toSalesReportDTO } from "@/lib/dto/reports";
import { formatMoney, toIntlLocale } from "@/lib/dto/money";
import { StatusBadge } from "@/components/admin/StatusBadge";

type SearchParams = { range?: string; from?: string; to?: string };

const RANGE_KEYS: ReportRangeKey[] = ["today", "yesterday", "7d", "month", "custom"];

// Threshold for the "this was a slow period" callout — comfortably past
// normal day-to-day noise, so it only fires on a period that's genuinely
// down, not on the routine dip every restaurant has some days of the week.
const LOW_PERIOD_THRESHOLD_PCT = -20;

function toDateInputValue(date: CalendarDate): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function formatDelta(pct: number | null): string | null {
  if (pct === null) return null;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePageRole("/admin/menu", UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN);

  const params = await searchParams;
  const [business, lang] = await Promise.all([getCurrentBusiness(), getAdminLang()]);
  const dict = getDictionary(lang).reports;
  const locale = toIntlLocale(lang);

  const parsed = parseRangeParams(params);
  const range = resolveReportRange(resolvableRangeKey(parsed), business.timezone, new Date(), parsed.custom);
  const raw = await loadSalesReportRawData(business.id, range);
  const report = toSalesReportDTO(raw, range, business.timezone);

  const money = (value: string) => formatMoney(value, business.currency, lang);
  // Every point.date is already a business-local calendar date — rendering
  // it through Date.UTC() and letting the formatter default to the SERVER's
  // timezone would shift the weekday label whenever the two zones disagree
  // (e.g. a US-hosted server showing a Mexican restaurant's chart). Pinning
  // timeZone: "UTC" here matches the Date.UTC() call below exactly, so the
  // label always reflects the calendar date itself, not a re-interpreted instant.
  const dayFormatter = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });

  const rangeLabel: Record<ReportRangeKey, string> = {
    today: dict.rangeToday,
    yesterday: dict.rangeYesterday,
    "7d": dict.range7d,
    month: dict.rangeMonth,
    custom: dict.rangeCustom,
  };
  const comparisonLabel: Record<ReportRangeKey, string> = {
    today: dict.comparisonLabelToday,
    yesterday: dict.comparisonLabelYesterday,
    "7d": dict.comparisonLabel7d,
    month: dict.comparisonLabelMonth,
    custom: dict.comparisonLabelCustom,
  };

  // The "custom" pill keeps whatever dates are already chosen — otherwise
  // re-clicking the already-active pill (or any link back to `?range=custom`
  // with no params) would silently drop them and reset the form.
  const rangeHref = (key: ReportRangeKey) => {
    if (key === "custom" && parsed.custom) {
      const qs = new URLSearchParams({
        range: "custom",
        from: toDateInputValue(parsed.custom.from),
        to: toDateInputValue(parsed.custom.to),
      });
      return `/admin/reportes?${qs.toString()}`;
    }
    return `/admin/reportes?range=${key}`;
  };

  const exportHref = (dataset: string) => {
    const qs = new URLSearchParams({ dataset, range: parsed.key });
    if (parsed.custom) {
      qs.set("from", toDateInputValue(parsed.custom.from));
      qs.set("to", toDateInputValue(parsed.custom.to));
    }
    return `/api/admin/reports/export?${qs.toString()}`;
  };

  const maxDaily = Math.max(1, ...report.dailySales.map((p) => Number(p.total)));
  const isLowPeriod = report.summary.netSalesDeltaPct !== null && report.summary.netSalesDeltaPct <= LOW_PERIOD_THRESHOLD_PCT;

  const th = "px-md py-[10px] text-[11px] font-medium uppercase tracking-[0.04em] text-on-surface-muted";
  const td = "px-md py-[8px]";
  const tableWrap = "overflow-hidden rounded-md border border-border bg-surface";
  const table = "w-full border-collapse text-left text-[13px]";
  const panel = "rounded-md border border-border bg-surface p-md";

  return (
    <div className="flex flex-col gap-md p-lg">
      <div className="flex flex-wrap items-center justify-between gap-md">
        <h1 className="font-display text-[22px] font-semibold text-on-surface">{dict.title}</h1>
        <div className="flex flex-wrap items-center gap-sm">
          <div className="flex flex-wrap gap-[4px] rounded-full border border-border bg-surface-subtle p-[3px]">
            {RANGE_KEYS.map((key) => (
              <Link
                key={key}
                href={rangeHref(key)}
                className={`rounded-full px-md py-[6px] text-[12.5px] font-medium transition-colors ${
                  parsed.key === key
                    ? "bg-primary text-on-primary"
                    : "text-on-surface-muted hover:bg-surface"
                }`}
              >
                {rangeLabel[key]}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {parsed.key === "custom" && (
        <form className="flex flex-wrap items-end gap-sm rounded-md border border-border bg-surface p-md">
          <input type="hidden" name="range" value="custom" />
          <label className="flex flex-col gap-[4px] text-[12px] text-on-surface-muted">
            {dict.customFrom}
            <input
              type="date"
              name="from"
              defaultValue={parsed.custom ? toDateInputValue(parsed.custom.from) : undefined}
              className="rounded-sm border border-border bg-surface px-sm py-[6px] text-[13px] text-on-surface"
            />
          </label>
          <label className="flex flex-col gap-[4px] text-[12px] text-on-surface-muted">
            {dict.customTo}
            <input
              type="date"
              name="to"
              defaultValue={parsed.custom ? toDateInputValue(parsed.custom.to) : undefined}
              className="rounded-sm border border-border bg-surface px-sm py-[6px] text-[13px] text-on-surface"
            />
          </label>
          <button
            type="submit"
            className="rounded-sm bg-primary px-md py-[7px] text-[13px] font-medium text-on-primary hover:bg-primary-hover"
          >
            {dict.customApply}
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 gap-md sm:grid-cols-3">
        <div className={panel}>
          <div className="text-[11.5px] font-medium uppercase tracking-[0.04em] text-on-surface-muted">
            {dict.statNetSales}
          </div>
          <div className="mt-[4px] font-display text-[26px] font-bold tabular-nums text-on-surface">
            {money(report.summary.netSales)}
          </div>
          {report.summary.netSalesDeltaPct !== null && (
            <div
              className={`mt-[6px] text-[12.5px] font-semibold ${
                report.summary.netSalesDeltaPct >= 0 ? "text-success" : "text-error"
              }`}
            >
              {formatDelta(report.summary.netSalesDeltaPct)}{" "}
              <span className="font-normal text-on-surface-muted">
                vs. {comparisonLabel[parsed.key]} ({money(report.summary.previous.netSales)})
              </span>
            </div>
          )}
        </div>
        <div className={panel}>
          <div className="text-[11.5px] font-medium uppercase tracking-[0.04em] text-on-surface-muted">
            {dict.statOrders}
          </div>
          <div className="mt-[4px] font-display text-[26px] font-bold tabular-nums text-on-surface">
            {report.summary.orderCount}
          </div>
          {report.summary.orderCountDeltaPct !== null && (
            <div
              className={`mt-[6px] text-[12.5px] font-semibold ${
                report.summary.orderCountDeltaPct >= 0 ? "text-success" : "text-error"
              }`}
            >
              {formatDelta(report.summary.orderCountDeltaPct)}{" "}
              <span className="font-normal text-on-surface-muted">vs. {report.summary.previous.orderCount}</span>
            </div>
          )}
        </div>
        <div className={panel}>
          <div className="text-[11.5px] font-medium uppercase tracking-[0.04em] text-on-surface-muted">
            {dict.statAvgTicket}
          </div>
          <div className="mt-[4px] font-display text-[26px] font-bold tabular-nums text-on-surface">
            {money(report.summary.averageTicket)}
          </div>
          {report.summary.averageTicketDeltaPct !== null && (
            <div
              className={`mt-[6px] text-[12.5px] font-semibold ${
                report.summary.averageTicketDeltaPct >= 0 ? "text-success" : "text-error"
              }`}
            >
              {formatDelta(report.summary.averageTicketDeltaPct)}{" "}
              <span className="font-normal text-on-surface-muted">vs. {money(report.summary.previous.averageTicket)}</span>
            </div>
          )}
        </div>
      </div>

      {isLowPeriod && (
        <div className="flex items-start gap-sm rounded-md border border-warning bg-warning/10 p-md text-[12.5px] text-on-surface">
          {dict.lowPeriodNotice}
        </div>
      )}

      <div className={panel}>
        <div className="mb-sm flex items-center justify-between">
          <span className="text-[14px] font-semibold text-on-surface">{dict.chartTitle}</span>
          <div className="flex items-center gap-sm">
            <span className="text-[11.5px] text-on-surface-muted">
              {dict.chartHint} · {business.currency}
            </span>
            <a href={exportHref("daily-sales")} className="text-[11.5px] font-medium text-primary hover:underline">
              {dict.exportCsv}
            </a>
          </div>
        </div>
        <div className="flex h-[130px] items-end gap-sm px-[4px]">
          {report.dailySales.map((point) => (
            <div
              key={`${point.date.year}-${point.date.month}-${point.date.day}`}
              className="flex h-full flex-1 flex-col items-center justify-end gap-[6px]"
            >
              <span className="text-[10.5px] font-medium text-on-surface-muted tabular-nums">{money(point.total)}</span>
              <div
                className="w-full max-w-[34px] rounded-t-sm bg-primary"
                style={{ height: `${Math.max(2, (Number(point.total) / maxDaily) * 100)}%` }}
              />
              <span className="text-[11px] text-on-surface-muted">
                {dayFormatter.format(new Date(Date.UTC(point.date.year, point.date.month - 1, point.date.day)))}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-md lg:grid-cols-2">
        <div className={panel}>
          <div className="mb-sm flex items-center justify-between">
            <div>
              <span className="text-[14px] font-semibold text-on-surface">{dict.methodsTitle}</span>{" "}
              <span className="text-[11.5px] text-on-surface-muted">· {dict.methodsHint}</span>
            </div>
            <a href={exportHref("payment-methods")} className="text-[11.5px] font-medium text-primary hover:underline">
              {dict.exportCsv}
            </a>
          </div>
          <div className="flex flex-col gap-[8px] text-[13px]">
            <div className="flex items-center justify-between">
              <span className="text-on-surface-muted">{dict.methodCash}</span>
              <span className="font-semibold tabular-nums text-on-surface">{money(report.paymentMethods.cash)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-on-surface-muted">{dict.methodCard}</span>
              <span className="font-semibold tabular-nums text-on-surface">{money(report.paymentMethods.card)}</span>
            </div>
          </div>
        </div>

        <div className={panel}>
          <div className="mb-sm flex items-center justify-between">
            <span className="text-[14px] font-semibold text-on-surface">{dict.orderTypeTitle}</span>
            <a href={exportHref("order-types")} className="text-[11.5px] font-medium text-primary hover:underline">
              {dict.exportCsv}
            </a>
          </div>
          <div className="flex flex-col gap-[8px] text-[13px]">
            <div className="flex items-center justify-between">
              <span className="text-on-surface-muted">{dict.orderTypeDineIn}</span>
              <span className="font-semibold tabular-nums text-on-surface">{report.orderTypes.dineIn}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-on-surface-muted">{dict.orderTypeTakeaway}</span>
              <span className="font-semibold tabular-nums text-on-surface">{report.orderTypes.takeaway}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-md lg:grid-cols-2">
        <div className={panel}>
          <div className="mb-sm flex items-center justify-between">
            <div>
              <span className="text-[14px] font-semibold text-on-surface">{dict.dishesTitle}</span>{" "}
              <span className="text-[11.5px] text-on-surface-muted">· {dict.dishesByUnitsHint}</span>
            </div>
            <a href={exportHref("dishes-by-units")} className="text-[11.5px] font-medium text-primary hover:underline">
              {dict.exportCsv}
            </a>
          </div>
          {report.dishesByUnits.length === 0 ? (
            <p className="text-[13px] text-on-surface-muted">{dict.emptyDishes}</p>
          ) : (
            <div className={tableWrap}>
              <table className={table}>
                <thead>
                  <tr className="bg-surface-subtle">
                    <th className={th}>{dict.colDish}</th>
                    <th className={`${th} text-right`}>{dict.colUnits}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.dishesByUnits.map((dish, index) => (
                    <tr
                      key={dish.menuItemId ?? dish.name}
                      className={`border-t border-border ${index % 2 === 1 ? "bg-surface-raised" : "bg-surface"}`}
                    >
                      <td className={`${td} text-on-surface`}>{dish.name}</td>
                      <td className={`${td} text-right tabular-nums text-on-surface-muted`}>{dish.units}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className={panel}>
          <div className="mb-sm flex items-center justify-between">
            <div>
              <span className="text-[14px] font-semibold text-on-surface">{dict.dishesTitle}</span>{" "}
              <span className="text-[11.5px] text-on-surface-muted">· {dict.dishesByRevenueHint}</span>
            </div>
            <a href={exportHref("dishes-by-revenue")} className="text-[11.5px] font-medium text-primary hover:underline">
              {dict.exportCsv}
            </a>
          </div>
          {report.dishesByRevenue.length === 0 ? (
            <p className="text-[13px] text-on-surface-muted">{dict.emptyDishes}</p>
          ) : (
            <div className={tableWrap}>
              <table className={table}>
                <thead>
                  <tr className="bg-surface-subtle">
                    <th className={th}>{dict.colDish}</th>
                    <th className={`${th} text-right`}>{dict.colRevenue}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.dishesByRevenue.map((dish, index) => (
                    <tr
                      key={dish.menuItemId ?? dish.name}
                      className={`border-t border-border ${index % 2 === 1 ? "bg-surface-raised" : "bg-surface"}`}
                    >
                      <td className={`${td} text-on-surface`}>{dish.name}</td>
                      <td className={`${td} text-right tabular-nums text-on-surface-muted`}>{money(dish.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className={panel}>
        <div className="mb-sm flex items-center justify-between">
          <span className="text-[14px] font-semibold text-on-surface">{dict.staffTitle}</span>
          <a href={exportHref("staff")} className="text-[11.5px] font-medium text-primary hover:underline">
            {dict.exportCsv}
          </a>
        </div>
        {report.staff.length === 0 ? (
          <p className="text-[13px] text-on-surface-muted">{dict.emptyStaff}</p>
        ) : (
          <div className={tableWrap}>
            <table className={table}>
              <thead>
                <tr className="bg-surface-subtle">
                  <th className={th}>{dict.colEmployee}</th>
                  <th className={`${th} text-right`}>{dict.colOrdersAttended}</th>
                  <th className={`${th} text-right`}>{dict.colCashCollected}</th>
                </tr>
              </thead>
              <tbody>
                {report.staff.map((member, index) => (
                  <tr
                    key={member.userId}
                    className={`border-t border-border ${index % 2 === 1 ? "bg-surface-raised" : "bg-surface"}`}
                  >
                    <td className={`${td} text-on-surface`}>{member.name}</td>
                    <td className={`${td} text-right tabular-nums text-on-surface-muted`}>{member.ordersAttended}</td>
                    <td className={`${td} text-right tabular-nums text-on-surface-muted`}>{money(member.cashCollected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={panel}>
        <div className="mb-sm flex items-center justify-between">
          <span className="text-[14px] font-semibold text-on-surface">{dict.cancellationsTitle}</span>
          <div className="flex items-center gap-sm">
            <a href={exportHref("cancellations")} className="text-[11.5px] font-medium text-primary hover:underline">
              {dict.exportCsv} ({dict.rowTypeCancelled})
            </a>
            <a href={exportHref("refunds")} className="text-[11.5px] font-medium text-primary hover:underline">
              {dict.exportCsv} ({dict.rowTypeRefund})
            </a>
          </div>
        </div>
        {report.cancellations.length === 0 && report.refunds.length === 0 ? (
          <p className="text-[13px] text-on-surface-muted">{dict.emptyCancellations}</p>
        ) : (
          <div className={tableWrap}>
            <table className={table}>
              <thead>
                <tr className="bg-surface-subtle">
                  <th className={th}>{dict.colOrder}</th>
                  <th className={th}>{dict.colRowType}</th>
                  <th className={th}>{dict.colReason}</th>
                  <th className={th}>{dict.colAuthor}</th>
                  <th className={`${th} text-right`}>{dict.colAmount}</th>
                </tr>
              </thead>
              <tbody>
                {report.cancellations.map((row, index) => (
                  <tr
                    key={`cancel-${row.orderId}`}
                    className={`border-t border-border ${index % 2 === 1 ? "bg-surface-raised" : "bg-surface"}`}
                  >
                    <td className={`${td} text-on-surface`}>{row.orderNumber}</td>
                    <td className={td}>
                      <StatusBadge variant="error">{dict.rowTypeCancelled}</StatusBadge>
                    </td>
                    <td className={`${td} text-on-surface-muted`}>{row.reason ?? dict.noReason}</td>
                    <td className={`${td} text-on-surface-muted`}>{row.byName ?? ""}</td>
                    <td className={`${td} text-right tabular-nums text-on-surface-muted`}>{money(row.amount)}</td>
                  </tr>
                ))}
                {report.refunds.map((row, index) => (
                  <tr
                    key={`refund-${row.orderNumber}-${row.processedAt}`}
                    className={`border-t border-border ${
                      (report.cancellations.length + index) % 2 === 1 ? "bg-surface-raised" : "bg-surface"
                    }`}
                  >
                    <td className={`${td} text-on-surface`}>{row.orderNumber}</td>
                    <td className={td}>
                      <StatusBadge variant="neutral">{dict.rowTypeRefund}</StatusBadge>
                    </td>
                    <td className={`${td} text-on-surface-muted`}>{row.reason ?? dict.noReason}</td>
                    <td className={`${td} text-on-surface-muted`}>{row.createdByName ?? ""}</td>
                    <td className={`${td} text-right tabular-nums text-error`}>-{money(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
