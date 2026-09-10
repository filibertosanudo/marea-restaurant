"use client";

import { formatMoney } from "@/lib/dto/money";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { Lang } from "@/lib/i18n/lang";
import type { CashSessionDetailDTO } from "@/lib/dto/cash-register";

type Dict = AdminDictionary["cashRegister"];

function movementLabel(movement: CashSessionDetailDTO["movements"][number], dict: Dict): string {
  if (movement.refundOrderNumber) return dict.refundWithdrawalReason.replace("{order}", movement.refundOrderNumber);
  return movement.reason;
}

export function CashSessionReceipt({
  session,
  activity,
  currency,
  lang,
  dict,
}: {
  session: CashSessionDetailDTO;
  activity: { cashCollected: string; deposits: string; withdrawals: string };
  currency: string;
  lang: Lang;
  dict: Dict;
}) {
  const money = (value: string) => formatMoney(value, currency, lang);
  const dateFormatter = new Intl.DateTimeFormat(lang === "es" ? "es-MX" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const isZero = Number(session.difference) === 0;
  const isShort = Number(session.difference) < 0;

  return (
    <div>
      <div className="mb-lg flex items-center justify-between print:hidden">
        <span className="text-[12.5px] text-on-surface-muted">{dict.drawerTitle}</span>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-full bg-primary px-md py-[9px] text-[13px] font-semibold text-on-primary hover:bg-primary-hover"
        >
          {dict.receiptPrintButton}
        </button>
      </div>

      <div className="receipt-print-area">
        <div className="receipt-paper">
          <div className="receipt-brand">
            <span className="receipt-brand-dot">M</span> MAREA
          </div>
          <div className="receipt-doc-title">{dict.receiptDocTitle}</div>

          <div className="receipt-kv">
            <span className="k">{dict.receiptShiftLabel}</span>
            <span>{session.openedByName}</span>
          </div>
          <div className="receipt-kv">
            <span className="k">{dict.receiptOpenedAtLabel}</span>
            <span>{dateFormatter.format(new Date(session.openedAt))}</span>
          </div>
          <div className="receipt-kv">
            <span className="k">{dict.receiptClosedAtLabel}</span>
            <span>{dateFormatter.format(new Date(session.closedAt))}</span>
          </div>
          <div className="receipt-kv">
            <span className="k">{dict.receiptFolioLabel}</span>
            <span className="tabular-nums">{session.id}</span>
          </div>
          <hr />
          <div className="receipt-kv">
            <span className="k">{dict.openingFloat}</span>
            <span className="tabular-nums">{money(session.openingFloat)}</span>
          </div>
          <div className="receipt-kv">
            <span className="k">{dict.cashCollected}</span>
            <span className="tabular-nums">{money(activity.cashCollected)}</span>
          </div>
          <div className="receipt-kv">
            <span className="k">{dict.deposits}</span>
            <span className="tabular-nums">{money(activity.deposits)}</span>
          </div>
          <div className="receipt-kv">
            <span className="k">{dict.withdrawals}</span>
            <span className="tabular-nums">-{money(activity.withdrawals)}</span>
          </div>
          <div className="receipt-kv total">
            <span className="k">{dict.expected}</span>
            <span className="tabular-nums">{money(session.expectedAmount)}</span>
          </div>
          <div className="receipt-kv">
            <span className="k">{dict.countedLabel}</span>
            <span className="tabular-nums">{money(session.countedAmount)}</span>
          </div>
          <div className={`receipt-diff-line ${isZero ? "ok" : isShort ? "short" : "over"}`}>
            <span>{dict.diffLabel}</span>
            <span className="tabular-nums">{money(session.difference)}</span>
          </div>

          {session.movements.length > 0 && (
            <>
              <hr />
              {session.movements.map((m) => (
                <div key={m.id} className="receipt-movement">
                  <span>{movementLabel(m, dict)}</span>
                  <span className="tabular-nums">
                    {m.type === "WITHDRAWAL" ? "-" : "+"}
                    {money(m.amount)}
                  </span>
                </div>
              ))}
            </>
          )}

          {session.notes && (
            <div className="receipt-note-box">
              <span className="lbl">{dict.receiptNoteLabel}</span>
              {session.notes}
            </div>
          )}

          <div className="receipt-sig">
            <div>{dict.receiptSignatureCashier}</div>
            <div>{dict.receiptSignatureSupervisor}</div>
          </div>
          <div className="receipt-foot">{dict.receiptFootNote}</div>
        </div>
      </div>
    </div>
  );
}
