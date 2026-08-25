import { formatMoney } from "@/lib/dto/money";

export type AmountRow = {
  label: string;
  /** Already-decimal string from decimalToString, never computed here — every amount this component shows was determined server-side. */
  value: string;
  emphasis?: boolean;
  muted?: boolean;
};

/**
 * A plain list of label/value rows, formatted with formatMoney — nothing
 * here adds, subtracts, or otherwise decides an amount. Used for "Total /
 * Paid / Refunded / Due" in the payment drawer and "Total / Paid" on the
 * customer tracking page; each caller decides which rows apply and
 * computes their values server-side (Prisma.Decimal), per the project rule
 * that no amount is calculated on the client.
 */
export function AmountBreakdown({
  currency,
  locale,
  rows,
}: {
  currency: string;
  locale: string;
  rows: AmountRow[];
}) {
  return (
    <dl className="flex flex-col gap-[6px]">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-md">
          <dt className={`text-[13px] ${row.muted ? "text-on-surface-muted" : "text-on-surface"}`}>
            {row.label}
          </dt>
          <dd
            className={`tabular-nums ${
              row.emphasis
                ? "font-display text-[19px] font-semibold text-on-surface"
                : `text-[13px] font-medium ${row.muted ? "text-on-surface-muted" : "text-on-surface"}`
            }`}
          >
            {formatMoney(row.value, currency, locale)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
