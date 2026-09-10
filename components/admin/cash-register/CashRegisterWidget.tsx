"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/dto/money";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { Lang } from "@/lib/i18n/lang";
import type { OpenCashSessionDTO, CashSessionActivityDTO, CashMovementDTO } from "@/lib/dto/cash-register";
import { openCashSessionAction, recordCashMovementAction, closeCashSessionAction } from "@/lib/cash-register/actions";
import { Drawer } from "@/components/admin/Drawer";

type Dict = AdminDictionary["cashRegister"];

function movementLabel(movement: CashMovementDTO, dict: Dict): string {
  if (movement.refundOrderNumber) {
    return dict.refundWithdrawalReason.replace("{order}", movement.refundOrderNumber);
  }
  return movement.reason;
}

function OpenSessionForm({ dict, onOpened }: { dict: Dict; onOpened: () => void }) {
  const [openingFloat, setOpeningFloat] = useState("0.00");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await openCashSessionAction(openingFloat);
      if (result?.error === "already_open") setError(dict.openErrorAlreadyOpen);
      else if (result?.error) setError(dict.openErrorGeneric);
      else onOpened();
    });
  }

  return (
    <div className="flex flex-col gap-md">
      <h4 className="text-[14px] font-semibold text-on-surface">{dict.openTitle}</h4>
      <label className="flex flex-col gap-[4px] text-[12px] text-on-surface-muted">
        {dict.openingFloatLabel}
        <input
          type="number"
          min="0"
          step="0.01"
          value={openingFloat}
          onChange={(e) => setOpeningFloat(e.target.value)}
          className="rounded-sm border border-border bg-surface px-sm py-[8px] text-[14px] text-on-surface"
        />
      </label>
      {error && <p className="text-[12.5px] text-error">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="rounded-sm bg-primary px-md py-[9px] text-[13px] font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
      >
        {dict.openButton}
      </button>
    </div>
  );
}

function MovementForm({ dict, onRecorded }: { dict: Dict; onRecorded: () => void }) {
  const [visible, setVisible] = useState(false);
  const [type, setType] = useState<"DEPOSIT" | "WITHDRAWAL">("WITHDRAWAL");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => setVisible(true)}
        className="w-full rounded-sm border border-dashed border-border py-sm text-[12.5px] font-medium text-on-surface-muted hover:bg-surface-subtle"
      >
        + {dict.addMovementButton}
      </button>
    );
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await recordCashMovementAction({ type, amount, reason });
      if (result?.error === "no_open_cash_session") setError(dict.movementErrorNoOpenSession);
      else if (result?.error) setError(dict.movementErrorInvalid);
      else {
        setAmount("");
        setReason("");
        setVisible(false);
        onRecorded();
      }
    });
  }

  return (
    <div className="flex flex-col gap-sm rounded-sm border border-border bg-surface-subtle p-sm">
      <div className="flex gap-sm">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as "DEPOSIT" | "WITHDRAWAL")}
          className="rounded-sm border border-border bg-surface px-sm py-[6px] text-[12.5px]"
        >
          <option value="WITHDRAWAL">{dict.movementWithdrawal}</option>
          <option value="DEPOSIT">{dict.movementDeposit}</option>
        </select>
        <input
          type="number"
          min="0.01"
          step="0.01"
          placeholder={dict.movementAmountLabel}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-[110px] rounded-sm border border-border bg-surface px-sm py-[6px] text-[12.5px]"
        />
      </div>
      <input
        type="text"
        placeholder={dict.movementReasonPlaceholder}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="rounded-sm border border-border bg-surface px-sm py-[6px] text-[12.5px]"
      />
      {error && <p className="text-[12px] text-error">{error}</p>}
      <div className="flex gap-sm">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-sm bg-primary px-sm py-[6px] text-[12.5px] font-semibold text-on-primary disabled:opacity-50"
        >
          {dict.movementSubmit}
        </button>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="rounded-sm px-sm py-[6px] text-[12.5px] text-on-surface-muted"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function CloseSessionForm({
  dict,
  expected,
  currency,
  lang,
  onClosed,
}: {
  dict: Dict;
  expected: string;
  currency: string;
  lang: Lang;
  onClosed: (id: string) => void;
}) {
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const countedNumber = Number(counted || "0");
  const expectedNumber = Number(expected);
  const difference = counted === "" ? null : countedNumber - expectedNumber;
  const hasDifference = difference !== null && Math.abs(difference) >= 0.005;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await closeCashSessionAction({ countedAmount: counted, notes: notes || undefined });
      if (!result.ok) {
        if (result.error === "note_required") setError(dict.closeErrorNoteRequired);
        else setError(dict.closeErrorGeneric);
        return;
      }
      onClosed(result.id);
    });
  }

  return (
    <div className="flex flex-col gap-sm rounded-sm border border-border p-md">
      <h4 className="text-[14px] font-semibold text-on-surface">{dict.closeTitle}</h4>
      <label className="flex flex-col gap-[4px] text-[12px] text-on-surface-muted">
        {dict.countedLabel}
        <input
          type="number"
          min="0"
          step="0.01"
          value={counted}
          onChange={(e) => setCounted(e.target.value)}
          className="rounded-sm border border-border bg-surface px-sm py-[8px] text-[16px] font-semibold text-on-surface"
        />
      </label>
      {difference !== null && (
        <div className={`rounded-sm p-sm text-[12.5px] ${hasDifference ? "bg-error/10 text-error" : "bg-success/10 text-success"}`}>
          <div className="font-semibold">
            {dict.diffLabel}: {formatMoney(difference.toFixed(2), currency, lang)}{" "}
            {hasDifference ? (difference < 0 ? `— ${dict.diffShort}` : `— ${dict.diffOver}`) : `— ${dict.diffOk}`}
          </div>
          {hasDifference && (
            <label className="mt-sm flex flex-col gap-[4px]">
              {dict.notesLabel}
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={dict.notesPlaceholder}
                className="min-h-[60px] rounded-sm border border-error bg-surface px-sm py-[6px] text-[12.5px] text-on-surface"
              />
              <span className="text-[11px] font-medium text-error">{dict.notesRequiredHint}</span>
            </label>
          )}
        </div>
      )}
      {error && <p className="text-[12.5px] text-error">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={pending || counted === ""}
        className={`rounded-sm px-md py-[9px] text-[13px] font-semibold text-on-primary disabled:opacity-50 ${
          hasDifference ? "bg-error" : "bg-primary hover:bg-primary-hover"
        }`}
      >
        {hasDifference ? dict.closeButtonWithDiff : dict.closeButton}
      </button>
    </div>
  );
}

export function CashRegisterWidget({
  session,
  activity,
  movements,
  currency,
  lang,
  dict,
}: {
  session: OpenCashSessionDTO | null;
  activity: CashSessionActivityDTO | null;
  movements: CashMovementDTO[];
  currency: string;
  lang: Lang;
  dict: Dict;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const money = (value: string) => formatMoney(value, currency, lang);

  function refreshAndKeepOpen() {
    router.refresh();
  }

  function handleClosed(id: string) {
    setOpen(false);
    router.push(`/admin/reportes/cortes/${id}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-[6px] rounded-sm px-sm py-[7px] text-[12.5px] font-semibold transition-colors ${
          session ? "bg-success/12 text-success hover:bg-success/20" : "border border-border/35 bg-surface text-on-surface-muted hover:text-on-surface"
        }`}
      >
        <span className={`h-[7px] w-[7px] rounded-full ${session ? "bg-success" : "bg-border"}`} />
        {session ? `${dict.pillOpen}${activity ? ` — ${money(activity.expected)}` : ""}` : dict.openTitle}
      </button>

      <Drawer open={open} onClose={() => setOpen(false)} title={dict.drawerTitle}>
        {!session ? (
          <OpenSessionForm dict={dict} onOpened={refreshAndKeepOpen} />
        ) : (
          <div className="flex flex-col gap-lg">
            <p className="text-[12.5px] text-on-surface-muted">
              {dict.pillOpenedBy.replace("{name}", session.openedByName)}
            </p>

            {activity && (
              <div className="flex flex-col gap-[6px] rounded-sm border border-border p-md text-[13px]">
                <h4 className="mb-[4px] text-[14px] font-semibold text-on-surface">{dict.expectedTitle}</h4>
                <div className="flex justify-between text-on-surface-muted">
                  <span>{dict.openingFloat}</span>
                  <span className="tabular-nums text-on-surface">{money(activity.openingFloat)}</span>
                </div>
                <div className="flex justify-between text-on-surface-muted">
                  <span>{dict.cashCollected}</span>
                  <span className="tabular-nums text-on-surface">{money(activity.cashCollected)}</span>
                </div>
                <div className="flex justify-between text-on-surface-muted">
                  <span>{dict.deposits}</span>
                  <span className="tabular-nums text-on-surface">{money(activity.deposits)}</span>
                </div>
                <div className="flex justify-between text-on-surface-muted">
                  <span>{dict.withdrawals}</span>
                  <span className="tabular-nums text-on-surface">-{money(activity.withdrawals)}</span>
                </div>
                <div className="mt-[4px] flex justify-between border-t border-border pt-[8px] text-[14px] font-bold text-on-surface">
                  <span>{dict.expected}</span>
                  <span className="tabular-nums">{money(activity.expected)}</span>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-sm">
              <h4 className="text-[14px] font-semibold text-on-surface">{dict.movementsTitle}</h4>
              {movements.length === 0 ? (
                <p className="text-[12.5px] text-on-surface-muted">{dict.noMovements}</p>
              ) : (
                <ul className="flex flex-col gap-[6px]">
                  {movements.map((m) => (
                    <li key={m.id} className="flex items-center justify-between text-[12.5px]">
                      <span className="text-on-surface">{movementLabel(m, dict)}</span>
                      <span className={`tabular-nums font-semibold ${m.type === "WITHDRAWAL" ? "text-error" : "text-success"}`}>
                        {m.type === "WITHDRAWAL" ? "-" : "+"}
                        {money(m.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <MovementForm dict={dict} onRecorded={refreshAndKeepOpen} />
            </div>

            {activity && (
              <CloseSessionForm dict={dict} expected={activity.expected} currency={currency} lang={lang} onClosed={handleClosed} />
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
