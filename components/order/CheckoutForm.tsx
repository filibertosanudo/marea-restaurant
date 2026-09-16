"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createOrderAction, type CheckoutState } from "@/lib/orders/actions";
import type { OrderDictionary } from "@/lib/i18n/dictionaries";
import type { Lang } from "@/lib/i18n/lang";
import type { PromotionRejectionReason } from "@/lib/promotions/engine";

const PROMO_REASON_KEY: Record<PromotionRejectionReason, keyof OrderDictionary> = {
  not_found: "promoErrorNotFound",
  not_active: "promoErrorNotActive",
  not_yet_active: "promoErrorNotYetActive",
  expired: "promoErrorExpired",
  wrong_day: "promoErrorWrongDay",
  wrong_time: "promoErrorWrongTime",
  wrong_order_type: "promoErrorWrongOrderType",
  min_order_not_met: "promoErrorMinOrderNotMet",
  no_matching_items: "promoErrorNoMatchingItems",
  no_discount: "promoErrorNoDiscount",
  usage_limit_reached: "promoErrorUsageLimitReached",
  per_user_limit_reached: "promoErrorPerUserLimitReached",
};

function errorMessage(state: CheckoutState, dict: OrderDictionary): string | null {
  if (!state?.error) return null;
  switch (state.error) {
    case "empty_cart":
      return dict.errorEmptyCart;
    case "item_unavailable":
      return dict.errorItemUnavailableNamed.replace("{dish}", state.dishName ?? "");
    case "modifier_unavailable":
      return dict.errorModifierUnavailableNamed.replace("{dish}", state.dishName ?? "");
    case "modifier_invalid":
      return dict.errorModifierInvalidNamed.replace("{dish}", state.dishName ?? "");
    case "promotion_exhausted":
      return dict.errorPromotionExhausted;
    case "invalid_promo_code":
      return dict[PROMO_REASON_KEY[state.promoReason ?? "not_found"]];
    case "rate_limited":
      return dict.errorRateLimited;
    case "invalid_input":
      return dict.requiredField;
  }
}

export function CheckoutForm({ dict, lang }: { dict: OrderDictionary; lang: Lang }) {
  const boundAction = createOrderAction.bind(null, lang);
  const [state, formAction, pending] = useActionState<CheckoutState, FormData>(
    boundAction,
    undefined
  );
  const message = errorMessage(state, dict);
  const fieldErrors = state?.error === "invalid_input" ? state.fieldErrors : {};

  return (
    <form action={formAction} className="flex flex-col gap-md">
      <div>
        <label htmlFor="guestName" className="mb-[6px] block text-[13px] font-medium text-on-surface">
          {dict.guestName}
        </label>
        <input
          id="guestName"
          name="guestName"
          type="text"
          autoComplete="name"
          required
          aria-invalid={Boolean(fieldErrors.guestName)}
          className="w-full rounded-md border border-border/50 bg-surface px-md py-[12px] text-[14px] text-on-surface outline-none focus:border-primary"
        />
      </div>
      <div>
        <label htmlFor="guestPhone" className="mb-[6px] block text-[13px] font-medium text-on-surface">
          {dict.guestPhone}
        </label>
        <input
          id="guestPhone"
          name="guestPhone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          aria-invalid={Boolean(fieldErrors.guestPhone)}
          className="w-full rounded-md border border-border/50 bg-surface px-md py-[12px] text-[14px] text-on-surface outline-none focus:border-primary"
        />
      </div>
      <div>
        <label htmlFor="guestEmail" className="mb-[6px] block text-[13px] font-medium text-on-surface">
          {dict.guestEmail}
        </label>
        <input
          id="guestEmail"
          name="guestEmail"
          type="email"
          inputMode="email"
          autoComplete="email"
          className="w-full rounded-md border border-border/50 bg-surface px-md py-[12px] text-[14px] text-on-surface outline-none focus:border-primary"
        />
      </div>
      <div>
        <label htmlFor="notes" className="mb-[6px] block text-[13px] font-medium text-on-surface">
          {dict.orderNotes}
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          placeholder={dict.orderNotesPlaceholder}
          className="w-full resize-none rounded-md border border-border/50 bg-surface px-md py-[12px] text-[14px] text-on-surface outline-none focus:border-primary"
        />
      </div>
      <div>
        <label htmlFor="promoCode" className="mb-[6px] block text-[13px] font-medium text-on-surface">
          {dict.promoCode}
        </label>
        <input
          id="promoCode"
          name="promoCode"
          type="text"
          autoCapitalize="characters"
          placeholder={dict.promoCodePlaceholder}
          aria-invalid={state?.error === "invalid_promo_code" || state?.error === "promotion_exhausted"}
          className="w-full rounded-md border border-border/50 bg-surface px-md py-[12px] text-[14px] uppercase text-on-surface outline-none focus:border-primary"
        />
      </div>

      {message && (
        <p role="alert" className="text-[12.5px] font-medium text-error">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-[4px] w-full rounded-full bg-primary py-[15px] text-[14.5px] font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? dict.confirmingOrder : dict.confirmOrder}
      </button>

      <Link href="/privacidad" className="text-center text-[12px] text-on-surface-muted underline">
        {dict.privacyNotice}
      </Link>
    </form>
  );
}
