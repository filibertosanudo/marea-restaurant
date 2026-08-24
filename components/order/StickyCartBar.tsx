"use client";

import { formatMoney } from "@/lib/dto/money";

type StickyCartBarProps = {
  itemCount: number;
  /** True if the cart has any line at all, including ones that became unavailable — keeps the bar (and the only way to open the cart) from vanishing and trapping the guest with stale lines they can't reach. */
  hasLines: boolean;
  subtotal: string;
  currency: string;
  locale: string;
  label: string;
  cta: string;
  /** Shown on the left instead of the count/subtotal when every line in the cart has become unavailable. */
  unavailableNotice: string;
  onOpen: () => void;
};

/** Thumb-zone CTA (H43/Fitts) — only mounts once the cart has something in it, per the empty-state rule (H28: no dead chrome for a cart with nothing at all). */
export function StickyCartBar({
  itemCount,
  hasLines,
  subtotal,
  currency,
  locale,
  label,
  cta,
  unavailableNotice,
  onOpen,
}: StickyCartBarProps) {
  if (!hasLines) return null;

  return (
    <div className="sticky bottom-0 z-20 px-md pb-[max(14px,env(safe-area-inset-bottom))] pt-3">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center justify-between rounded-full bg-primary py-[6px] pl-lg pr-[6px] text-on-primary shadow-2"
      >
        <span className="text-[13px] font-medium">
          {itemCount > 0 ? (
            <>
              <span className="font-semibold tabular-nums">{itemCount}</span> {label} ·{" "}
              <span className="tabular-nums">{formatMoney(subtotal, currency, locale)}</span>
            </>
          ) : (
            unavailableNotice
          )}
        </span>
        <span className="flex items-center gap-[6px] rounded-full bg-on-primary/15 px-md py-[10px] text-[13px] font-semibold">
          {cta}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
    </div>
  );
}
