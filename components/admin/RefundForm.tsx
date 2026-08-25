"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/dto/money";

export type RefundMode = "FULL" | "PARTIAL";

const ARROW_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

/**
 * role="radio"/"radiogroup" implies arrow-key selection between the
 * options (not just Tab+Enter) — without this, the ARIA role promises
 * keyboard behavior neither button actually implements. Only two options
 * here, so "any arrow key" just flips between them and moves focus with it.
 */
function handleRadioKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, other: RefundMode, select: (mode: RefundMode) => void) {
  if (!ARROW_KEYS.has(e.key)) return;
  e.preventDefault();
  select(other);
  // React hasn't re-rendered yet, so aria-checked on the DOM is still
  // stale — with only two options, "the sibling that isn't me" is always
  // the one about to become selected, no need to wait for the re-render.
  const buttons = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
  for (const button of buttons ?? []) {
    if (button !== e.currentTarget) {
      button.focus();
      break;
    }
  }
}

/**
 * Full-or-partial refund, reason required. `refundableAmount` (paidTotal
 * minus what's already been refunded) comes from the server — see
 * OrderPaymentDetailDTO — and is only ever displayed here, never
 * recomputed; the partial-amount input is free text the server validates
 * against that same number when the real refund action lands in a later
 * phase ("a refund exceeding what was collected is rejected server-side"
 * per the brief, not by this form pretending to enforce it client-side).
 *
 * `onSubmit` is optional the same way CardPaymentPanel's is: undefined
 * today (Fase 5 wires the real Stripe refund + Refund-row transaction),
 * so the button stays disabled with `disabledCaption` instead of doing
 * nothing silently.
 */
export function RefundForm({
  currency,
  locale,
  refundableAmount,
  mode,
  onModeChange,
  partialAmount,
  onPartialAmountChange,
  reason,
  onReasonChange,
  onSubmit,
  dict,
}: {
  currency: string;
  locale: string;
  refundableAmount: string;
  mode: RefundMode;
  onModeChange: (mode: RefundMode) => void;
  partialAmount: string;
  onPartialAmountChange: (value: string) => void;
  reason: string;
  onReasonChange: (value: string) => void;
  onSubmit?: () => void;
  dict: {
    title: string;
    fullLabel: string;
    partialLabel: string;
    partialAmountLabel: string;
    reasonLabel: string;
    reasonPlaceholder: string;
    reasonRequired: string;
    submitLabel: string;
    disabledCaption: string;
    refundableLabel: string;
  };
}) {
  const [reasonTouched, setReasonTouched] = useState(false);
  const reasonMissing = reason.trim().length === 0;
  const showReasonError = reasonTouched && reasonMissing;
  const canSubmit = Boolean(onSubmit) && !reasonMissing;

  return (
    <div className="flex flex-col gap-md rounded-lg border border-border/25 bg-surface p-md">
      <div>
        <h3 className="text-[14px] font-semibold text-on-surface">{dict.title}</h3>
        <p className="mt-[2px] text-[12px] text-on-surface-muted">
          {dict.refundableLabel} {formatMoney(refundableAmount, currency, locale)}
        </p>
      </div>

      <div role="radiogroup" aria-label={dict.title} className="flex gap-sm">
        <button
          type="button"
          role="radio"
          aria-checked={mode === "FULL"}
          tabIndex={mode === "FULL" ? 0 : -1}
          onClick={() => onModeChange("FULL")}
          onKeyDown={(e) => handleRadioKeyDown(e, "PARTIAL", onModeChange)}
          className={`flex-1 rounded-sm border px-sm py-[8px] text-[12.5px] font-medium transition-colors ${
            mode === "FULL"
              ? "border-primary bg-surface-ocean text-primary"
              : "border-border/30 text-on-surface-muted hover:text-on-surface"
          }`}
        >
          {dict.fullLabel}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === "PARTIAL"}
          tabIndex={mode === "PARTIAL" ? 0 : -1}
          onClick={() => onModeChange("PARTIAL")}
          onKeyDown={(e) => handleRadioKeyDown(e, "FULL", onModeChange)}
          className={`flex-1 rounded-sm border px-sm py-[8px] text-[12.5px] font-medium transition-colors ${
            mode === "PARTIAL"
              ? "border-primary bg-surface-ocean text-primary"
              : "border-border/30 text-on-surface-muted hover:text-on-surface"
          }`}
        >
          {dict.partialLabel}
        </button>
      </div>

      {mode === "PARTIAL" && (
        <div>
          <label htmlFor="refund-partial-amount" className="mb-[6px] block text-[13px] font-medium text-on-surface">
            {dict.partialAmountLabel}
          </label>
          <input
            id="refund-partial-amount"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={partialAmount}
            onChange={(e) => onPartialAmountChange(e.target.value)}
            className="w-full rounded-sm border border-border/50 bg-surface px-sm py-[8px] text-[13px] text-on-surface outline-none focus:border-primary"
          />
        </div>
      )}

      <div>
        <label htmlFor="refund-reason" className="mb-[6px] block text-[13px] font-medium text-on-surface">
          {dict.reasonLabel}
        </label>
        <textarea
          id="refund-reason"
          rows={2}
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          onBlur={() => setReasonTouched(true)}
          placeholder={dict.reasonPlaceholder}
          aria-invalid={showReasonError}
          aria-describedby={showReasonError ? "refund-reason-error" : undefined}
          className="w-full resize-none rounded-sm border border-border/50 bg-surface px-sm py-[8px] text-[13px] text-on-surface outline-none focus:border-primary"
        />
        {showReasonError && (
          <p id="refund-reason-error" className="mt-[4px] text-[11.5px] text-on-surface-muted">
            {dict.reasonRequired}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit}
        className="rounded-full bg-error px-lg py-[11px] text-[13.5px] font-semibold text-on-primary transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {dict.submitLabel}
      </button>
      {!onSubmit && <p className="text-[11.5px] text-on-surface-muted">{dict.disabledCaption}</p>}
    </div>
  );
}
