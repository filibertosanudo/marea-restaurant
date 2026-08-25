"use client";

import { formatMoney } from "@/lib/dto/money";

export type RefundMode = "FULL" | "PARTIAL";

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
  const reasonMissing = reason.trim().length === 0;
  const canSubmit = Boolean(onSubmit) && !reasonMissing;

  return (
    <div className="flex flex-col gap-md rounded-lg border border-border/25 bg-surface p-md">
      <div>
        <h3 className="text-[14px] font-semibold text-on-surface">{dict.title}</h3>
        <p className="mt-[2px] text-[12px] text-on-surface-muted">
          {dict.refundableLabel} {formatMoney(refundableAmount, currency, locale)}
        </p>
      </div>

      <div role="radiogroup" className="flex gap-sm">
        <button
          type="button"
          role="radio"
          aria-checked={mode === "FULL"}
          onClick={() => onModeChange("FULL")}
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
          onClick={() => onModeChange("PARTIAL")}
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
          placeholder={dict.reasonPlaceholder}
          aria-invalid={reasonMissing}
          className="w-full resize-none rounded-sm border border-border/50 bg-surface px-sm py-[8px] text-[13px] text-on-surface outline-none focus:border-primary"
        />
        {reasonMissing && (
          <p className="mt-[4px] text-[11.5px] text-on-surface-muted">{dict.reasonRequired}</p>
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
