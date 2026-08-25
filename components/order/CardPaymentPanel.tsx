"use client";

export type CardPaymentStatus = "form" | "processing" | "requires_action" | "failed" | "succeeded";

function Spinner() {
  return (
    <svg
      className="h-5 w-5 animate-spin text-primary"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Everything after the customer picks "pay with card" — the card field,
 * and the four states that flow can land in. Stripe's PaymentIntent
 * creation and confirmation land in a later phase (`lib/payments/`, Fase
 * 4); this component is deliberately decoupled from that — it renders
 * whatever `status` it's given, so wiring the real Stripe.js callbacks in
 * later is a matter of driving this prop, not rebuilding the screens.
 *
 * The "form" state's submit is disabled today (`disabledCaption`
 * explains why) rather than faked, since there's no PaymentIntent to
 * confirm yet — better an honest "not yet" than a submit button that
 * silently does nothing.
 */
export function CardPaymentPanel({
  status,
  amountLabel,
  onSubmit,
  onRetry,
  onSwitchToCash,
  errorMessage,
  dict,
}: {
  status: CardPaymentStatus;
  amountLabel: string;
  onSubmit?: () => void;
  onRetry?: () => void;
  onSwitchToCash?: () => void;
  errorMessage?: string;
  dict: {
    cardFieldLabel: string;
    cardFieldPlaceholder: string;
    payLabel: string;
    disabledCaption: string;
    processingTitle: string;
    processingBody: string;
    requiresActionTitle: string;
    requiresActionBody: string;
    failedTitle: string;
    failedBodyFallback: string;
    retry: string;
    switchToCash: string;
    succeededTitle: string;
    succeededBody: string;
  };
}) {
  if (status === "processing") {
    return (
      <div className="flex flex-col items-center gap-sm rounded-lg border border-border/25 bg-surface p-lg text-center">
        <Spinner />
        <p className="text-[14px] font-semibold text-on-surface">{dict.processingTitle}</p>
        <p className="text-[12.5px] text-on-surface-muted">{dict.processingBody}</p>
      </div>
    );
  }

  if (status === "requires_action") {
    return (
      <div className="flex flex-col items-center gap-sm rounded-lg border border-warning/30 bg-warning/8 p-lg text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-warning/16 text-warning">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="9" width="16" height="11" rx="2" />
            <path d="M8 9V6a4 4 0 0 1 8 0v3" />
          </svg>
        </div>
        <p className="text-[14px] font-semibold text-on-surface">{dict.requiresActionTitle}</p>
        <p className="text-[12.5px] text-on-surface-muted">{dict.requiresActionBody}</p>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="flex flex-col gap-sm rounded-lg border border-error/30 bg-error/8 p-lg">
        <div className="flex items-start gap-sm">
          <div className="mt-[1px] flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-error/16 text-error">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p className="text-[14px] font-semibold text-error">{dict.failedTitle}</p>
            <p className="mt-[2px] text-[12.5px] leading-snug text-on-surface-muted">
              {errorMessage || dict.failedBodyFallback}
            </p>
          </div>
        </div>
        <div className="flex gap-sm">
          <button
            type="button"
            onClick={onRetry}
            className="flex-1 rounded-full bg-primary py-[12px] text-[13.5px] font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            {dict.retry}
          </button>
          <button
            type="button"
            onClick={onSwitchToCash}
            className="flex-1 rounded-full border border-border/40 py-[12px] text-[13.5px] font-semibold text-on-surface transition-colors hover:bg-surface-subtle"
          >
            {dict.switchToCash}
          </button>
        </div>
      </div>
    );
  }

  if (status === "succeeded") {
    return (
      <div className="flex flex-col items-center gap-sm rounded-lg border border-success/30 bg-success/8 p-lg text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-success/16 text-success">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-[14px] font-semibold text-on-surface">{dict.succeededTitle}</p>
        <p className="text-[12.5px] text-on-surface-muted">{dict.succeededBody}</p>
      </div>
    );
  }

  // status === "form" — the slot a real Stripe PaymentElement mounts into
  // once Fase 4 wires it; today it's a static placeholder that still
  // communicates what's coming (card number/expiry/CVC layout) so the
  // screen reads as finished, not broken.
  return (
    <div className="flex flex-col gap-sm">
      <div>
        <span className="mb-[6px] block text-[13px] font-medium text-on-surface">
          {dict.cardFieldLabel}
        </span>
        <div className="flex items-center gap-sm rounded-md border border-border/50 bg-surface px-md py-[12px] text-[14px] text-on-surface-muted">
          <svg width="20" height="14" viewBox="0 0 24 17" fill="none" aria-hidden>
            <rect x="0.5" y="0.5" width="23" height="16" rx="2" stroke="currentColor" />
            <rect x="0.5" y="4" width="23" height="3" fill="currentColor" />
          </svg>
          {dict.cardFieldPlaceholder}
        </div>
      </div>
      <button
        type="button"
        onClick={onSubmit}
        disabled={!onSubmit}
        className="mt-[4px] w-full rounded-full bg-primary py-[15px] text-[14.5px] font-semibold text-on-primary transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        {dict.payLabel.replace("{amount}", amountLabel)}
      </button>
      {!onSubmit && <p className="text-center text-[11.5px] text-on-surface-muted">{dict.disabledCaption}</p>}
    </div>
  );
}
