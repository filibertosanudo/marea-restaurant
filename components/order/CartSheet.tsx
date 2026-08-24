"use client";

import { useTransition } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/dto/money";
import type { CartDTO } from "@/lib/cart/dto";
import type { OrderDictionary } from "@/lib/i18n/dictionaries";
import { updateCartItemQuantityAction, removeCartItemAction } from "@/lib/cart/actions";
import { QuantityStepper } from "./QuantityStepper";

export function CartSheet({
  cart,
  currency,
  locale,
  dict,
  onClose,
}: {
  cart: CartDTO;
  currency: string;
  locale: string;
  dict: OrderDictionary;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const isEmpty = cart.availableItems.length === 0 && cart.unavailableItems.length === 0;

  function setQuantity(cartItemId: string, quantity: number) {
    startTransition(async () => {
      await updateCartItemQuantityAction(cartItemId, quantity);
    });
  }

  function remove(cartItemId: string) {
    startTransition(async () => {
      await removeCartItemAction(cartItemId);
    });
  }

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label={dict.viewCart}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-on-surface/40"
      />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-xl bg-surface shadow-hero">
        <div className="mx-auto mt-[10px] h-[4px] w-9 shrink-0 rounded-full bg-border/50" />
        <div className="flex shrink-0 items-center justify-between px-lg pb-md pt-md">
          <h2 className="font-display text-[17px] font-semibold text-on-surface">{dict.yourCart}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={dict.remove}
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-muted hover:bg-surface-subtle"
          >
            ✕
          </button>
        </div>

        {isEmpty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-md px-lg pb-[10vh] text-center">
            <p className="font-display text-[16px] font-semibold text-on-surface">
              {dict.cartEmptyTitle}
            </p>
            <p className="max-w-[32ch] text-[13px] text-on-surface-muted">{dict.cartEmptyBody}</p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-primary px-lg py-[11px] text-[13.5px] font-medium text-on-primary"
            >
              {dict.cartEmptyCta}
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-lg" aria-busy={pending}>
              {cart.unavailableItems.map((line) => (
                <div key={line.id} className="border-b border-border/20 py-md opacity-60">
                  <div className="flex items-baseline justify-between gap-md">
                    <span className="text-[13.5px] font-medium line-through">{line.name}</span>
                    <button
                      type="button"
                      onClick={() => remove(line.id)}
                      className="text-[11.5px] font-medium text-error underline"
                    >
                      {dict.remove}
                    </button>
                  </div>
                  <p className="mt-[3px] text-[11.5px] text-error">{dict.unavailableNotice}</p>
                </div>
              ))}
              {cart.availableItems.map((line) => (
                <div key={line.id} className="border-b border-border/20 py-md last:border-b-0">
                  <div className="flex items-start justify-between gap-md">
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold text-on-surface">{line.name}</p>
                      {line.modifiers.length > 0 && (
                        <p className="mt-[2px] text-[11.5px] text-on-surface-muted">
                          {line.modifiers.map((m) => m.name).join(" · ")}
                        </p>
                      )}
                      {line.notes && (
                        <p className="mt-[2px] text-[11.5px] italic text-on-surface-muted">
                          {line.notes}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-[13.5px] font-semibold tabular-nums text-on-surface">
                      {formatMoney(line.lineTotal, currency, locale)}
                    </span>
                  </div>
                  <div className="mt-[10px] flex items-center justify-between">
                    <QuantityStepper
                      value={line.quantity}
                      min={0}
                      onChange={(next) => setQuantity(line.id, next)}
                      decreaseLabel="-"
                      increaseLabel="+"
                    />
                    <button
                      type="button"
                      onClick={() => remove(line.id)}
                      className="text-[11.5px] font-medium text-on-surface-muted underline"
                    >
                      {dict.remove}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="shrink-0 border-t border-border/20 px-lg py-md pb-[max(16px,env(safe-area-inset-bottom))]">
              <div className="mb-md flex items-baseline justify-between">
                <span className="text-[13px] text-on-surface-muted">{dict.subtotal}</span>
                <span className="font-display text-[19px] font-semibold tabular-nums text-on-surface">
                  {formatMoney(cart.subtotal, currency, locale)}
                </span>
              </div>
              <Link
                href="/menu/checkout"
                className="block w-full rounded-full bg-primary py-[14px] text-center text-[14.5px] font-semibold text-on-primary transition-colors hover:bg-primary-hover"
              >
                {dict.continue}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
