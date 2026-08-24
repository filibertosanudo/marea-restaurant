"use client";

import { useActionState, useEffect, useState } from "react";
import { formatMoney, addMoneyStrings, mulMoneyString } from "@/lib/dto/money";
import type { PublicDish, PublicModifierGroup } from "@/lib/menu/public-menu";
import type { AddToCartState } from "@/lib/cart/actions";
import type { OrderDictionary } from "@/lib/i18n/dictionaries";
import { QuantityStepper } from "./QuantityStepper";

function initialSelection(groups: PublicModifierGroup[]): Record<string, string[]> {
  const initial: Record<string, string[]> = {};
  for (const group of groups) {
    initial[group.id] = group.options.filter((o) => o.isDefault && o.isAvailable).map((o) => o.id);
  }
  return initial;
}

function groupIsSatisfied(group: PublicModifierGroup, selected: string[]): boolean {
  const min = group.isRequired ? Math.max(group.minSelections, 1) : group.minSelections;
  const max = group.selectionType === "SINGLE" ? 1 : group.maxSelections ?? Infinity;
  return selected.length >= min && selected.length <= max;
}

/** Maps addToCartAction's error codes (see lib/cart/actions.ts and lib/cart/modifier-validation.ts) to a message that actually matches what went wrong, instead of always showing the same one. */
function errorMessage(code: string, dict: OrderDictionary): string {
  switch (code) {
    case "item_unavailable":
      return dict.errorItemUnavailable;
    case "unknown_modifier_option":
    case "modifier_option_unavailable":
    case "modifier_group_selection_out_of_range":
      return dict.errorModifierSelection;
    default:
      return dict.errorGeneric;
  }
}

export function ItemSheet({
  dish,
  currency,
  locale,
  dict,
  boundAddAction,
  onClose,
  onAdded,
}: {
  dish: PublicDish;
  currency: string;
  locale: string;
  dict: OrderDictionary;
  boundAddAction: (state: AddToCartState, formData: FormData) => Promise<AddToCartState>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [selection, setSelection] = useState(() => initialSelection(dish.modifierGroups));
  const [quantity, setQuantity] = useState(1);
  const [state, formAction, pending] = useActionState<AddToCartState, FormData>(
    boundAddAction,
    undefined
  );

  useEffect(() => {
    if (state && "success" in state && state.success) {
      onAdded();
    }
  }, [state, onAdded]);

  const selectedDeltas = dish.modifierGroups
    .flatMap((g) => g.options)
    .filter((o) => Object.values(selection).flat().includes(o.id))
    .map((o) => o.priceDelta);
  const unitPrice = addMoneyStrings(dish.priceValue, ...selectedDeltas);
  const total = mulMoneyString(unitPrice, quantity);

  const allGroupsSatisfied = dish.modifierGroups.every((g) => groupIsSatisfied(g, selection[g.id] ?? []));

  function toggleOption(group: PublicModifierGroup, optionId: string) {
    setSelection((prev) => {
      const current = prev[group.id] ?? [];
      if (group.selectionType === "SINGLE") {
        return { ...prev, [group.id]: [optionId] };
      }
      const max = group.maxSelections ?? Infinity;
      if (current.includes(optionId)) {
        return { ...prev, [group.id]: current.filter((id) => id !== optionId) };
      }
      if (current.length >= max) return prev;
      return { ...prev, [group.id]: [...current, optionId] };
    });
  }

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label={dict.remove}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-on-surface/40"
      />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-xl bg-surface shadow-hero">
        <div className="mx-auto mt-[10px] h-[4px] w-9 shrink-0 rounded-full bg-border/50" />
        <div
          className="h-36 shrink-0"
          style={{ background: "linear-gradient(135deg, #b9843f, #6e4a1f)" }}
          role="img"
          aria-label={dish.name}
        />
        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <input type="hidden" name="menuItemId" value={dish.id} />
          <input type="hidden" name="quantity" value={quantity} />

          <div className="flex-1 overflow-y-auto px-lg pt-md">
            <h3 className="font-display text-[18px] font-semibold text-on-surface">{dish.name}</h3>
            <p className="mb-md mt-[2px] text-[14.5px] font-semibold tabular-nums text-primary">
              {formatMoney(unitPrice, currency, locale)}
            </p>
            <p className="mb-lg text-[12.5px] leading-relaxed text-on-surface-muted">{dish.desc}</p>

            {dish.modifierGroups.map((group) => (
              <fieldset key={group.id} className="mb-lg">
                <legend className="mb-[8px] flex w-full items-baseline justify-between text-[13.5px]">
                  <span className="font-semibold text-on-surface">{group.name}</span>
                  <span className="text-[11px] text-on-surface-muted">
                    {group.selectionType === "SINGLE"
                      ? dict.chooseOne
                      : dict.chooseUpTo.replace(
                          "{n}",
                          String(group.maxSelections ?? group.options.length)
                        )}
                    {group.isRequired ? ` · ${dict.required}` : ""}
                  </span>
                </legend>
                {group.options.map((option) => {
                  const checked = (selection[group.id] ?? []).includes(option.id);
                  const inputType = group.selectionType === "SINGLE" ? "radio" : "checkbox";
                  return (
                    <label
                      key={option.id}
                      className={`flex items-center justify-between border-b border-border/20 py-[11px] text-[13.5px] last:border-b-0 ${
                        !option.isAvailable ? "opacity-40" : ""
                      }`}
                    >
                      <span className="flex items-center gap-[10px]">
                        <input
                          type={inputType}
                          name="optionIds"
                          value={option.id}
                          checked={checked}
                          disabled={!option.isAvailable}
                          onChange={() => toggleOption(group, option.id)}
                          className="h-[18px] w-[18px] accent-primary"
                        />
                        {option.name}
                      </span>
                      <span className="tabular-nums text-on-surface-muted">
                        {Number(option.priceDelta) > 0
                          ? `+${formatMoney(option.priceDelta, currency, locale)}`
                          : formatMoney(option.priceDelta, currency, locale)}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            ))}

            {state && "error" in state && state.error && (
              <p role="alert" className="mb-md text-[12.5px] font-medium text-error">
                {errorMessage(state.error, dict)}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-md border-t border-border/20 px-lg py-md pb-[max(16px,env(safe-area-inset-bottom))]">
            <QuantityStepper
              value={quantity}
              onChange={setQuantity}
              decreaseLabel="-"
              increaseLabel="+"
            />
            <button
              type="submit"
              disabled={!allGroupsSatisfied || pending}
              className="flex-1 rounded-full bg-primary py-[13px] text-center text-[14px] font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {dict.add} — {formatMoney(total, currency, locale)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
