import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { getCurrentBusiness } from "@/lib/business";
import { getAdminLang } from "@/lib/i18n/cookie";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { resolveReportRange } from "@/lib/reports/date-range";
import { parseRangeParams, resolvableRangeKey } from "@/lib/reports/range-params";
import { loadSalesReportRawData } from "@/lib/reports/queries";
import { toSalesReportDTO, type SalesReportDTO } from "@/lib/dto/reports";
import { toCsv } from "@/lib/reports/csv";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";

const DATASETS = [
  "daily-sales",
  "payment-methods",
  "order-types",
  "dishes-by-units",
  "dishes-by-revenue",
  "staff",
  "cancellations",
  "refunds",
] as const;
type Dataset = (typeof DATASETS)[number];

function isDataset(value: string | null): value is Dataset {
  return value !== null && (DATASETS as readonly string[]).includes(value);
}

function buildDatasetCsv(dataset: Dataset, dto: SalesReportDTO, dict: AdminDictionary["reports"]): string {
  switch (dataset) {
    case "daily-sales":
      return toCsv(
        [dict.chartTitle, dict.statNetSales],
        dto.dailySales.map((p) => [`${p.date.year}-${String(p.date.month).padStart(2, "0")}-${String(p.date.day).padStart(2, "0")}`, p.total])
      );
    case "payment-methods":
      return toCsv(
        [dict.methodsTitle, dict.statNetSales],
        [
          [dict.methodCash, dto.paymentMethods.cash],
          [dict.methodCard, dto.paymentMethods.card],
        ]
      );
    case "order-types":
      return toCsv(
        [dict.orderTypeTitle, dict.statOrders],
        [
          [dict.orderTypeDineIn, dto.orderTypes.dineIn],
          [dict.orderTypeTakeaway, dto.orderTypes.takeaway],
        ]
      );
    case "dishes-by-units":
      return toCsv(
        [dict.colDish, dict.colUnits, dict.colRevenue],
        dto.dishesByUnits.map((d) => [d.name, d.units, d.revenue])
      );
    case "dishes-by-revenue":
      return toCsv(
        [dict.colDish, dict.colUnits, dict.colRevenue],
        dto.dishesByRevenue.map((d) => [d.name, d.units, d.revenue])
      );
    case "staff":
      return toCsv(
        [dict.colEmployee, dict.colOrdersAttended, dict.colCashCollected],
        dto.staff.map((s) => [s.name, s.ordersAttended, s.cashCollected])
      );
    case "cancellations":
      return toCsv(
        [dict.colOrder, dict.colReason, dict.colAuthor, dict.colAmount],
        dto.cancellations.map((c) => [c.orderNumber, c.reason ?? dict.noReason, c.byName ?? "", c.amount])
      );
    case "refunds":
      return toCsv(
        [dict.colOrder, dict.colReason, dict.colAuthor, dict.colAmount],
        dto.refunds.map((r) => [r.orderNumber, r.reason ?? dict.noReason, r.createdByName ?? "", r.amount])
      );
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (
    !session?.user ||
    session.user.revoked ||
    session.user.mustChangePassword ||
    !ADMIN_ROLES.includes(session.user.role)
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const datasetParam = params.get("dataset");
  if (!isDataset(datasetParam)) return new Response("Unknown dataset", { status: 400 });

  const business = await getCurrentBusiness();
  const lang = await getAdminLang();
  const dict = getDictionary(lang);

  const rangeInput = parseRangeParams({
    range: params.get("range") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  });
  const range = resolveReportRange(resolvableRangeKey(rangeInput), business.timezone, new Date(), rangeInput.custom);
  const raw = await loadSalesReportRawData(business.id, range);
  const dto = toSalesReportDTO(raw, range, business.timezone);

  const csv = buildDatasetCsv(datasetParam, dto, dict.reports);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${datasetParam}.csv"`,
    },
  });
}
