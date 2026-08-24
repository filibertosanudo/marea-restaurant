"use client";

import { formatMoney } from "@/lib/dto/money";
import type { PublicDish } from "@/lib/menu/public-menu";

// A handful of warm/ocean gradients standing in for dish photography —
// this app has no image pipeline yet (see components/marea-landing's
// Placeholder), so the placeholder itself gets some visual variety instead
// of one flat block repeated down the list.
const PHOTO_GRADIENTS = [
  "linear-gradient(135deg, #cf7b52, #8a4a2c)",
  "linear-gradient(135deg, #4d7c8a, #23434d)",
  "linear-gradient(135deg, #b9843f, #6e4a1f)",
  "linear-gradient(135deg, #7a8f5c, #3c4a29)",
];

function gradientFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PHOTO_GRADIENTS[hash % PHOTO_GRADIENTS.length];
}

export function DishCard({
  dish,
  currency,
  locale,
  addLabel,
  onOpen,
}: {
  dish: PublicDish;
  currency: string;
  locale: string;
  addLabel: string;
  onOpen: (dish: PublicDish) => void;
}) {
  return (
    <article className="overflow-hidden rounded-lg bg-surface shadow-1">
      <div
        className="relative h-32"
        style={{ background: gradientFor(dish.id) }}
        role="img"
        aria-label={dish.name}
      >
        {dish.tags.length > 0 && (
          <div className="absolute left-[10px] top-[10px] flex flex-wrap gap-[6px]">
            {dish.tags.slice(0, 2).map((tag) => (
              <span
                key={tag.id}
                className="rounded-full bg-surface/90 px-[8px] py-[3px] text-[9.5px] font-semibold text-on-surface"
              >
                {tag.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="p-md">
        <div className="flex items-baseline justify-between gap-[10px]">
          <h3 className="font-display text-[15.5px] font-semibold text-on-surface">{dish.name}</h3>
          <span className="whitespace-nowrap font-display text-[15.5px] font-semibold tabular-nums text-primary">
            {formatMoney(dish.priceValue, currency, locale)}
          </span>
        </div>
        <p className="mb-[12px] mt-[4px] line-clamp-2 text-[12.5px] leading-relaxed text-on-surface-muted">
          {dish.desc}
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onOpen(dish)}
            className="rounded-full bg-primary px-lg py-[9px] text-[13px] font-medium text-on-primary transition-colors hover:bg-primary-hover"
          >
            {addLabel}
          </button>
        </div>
      </div>
    </article>
  );
}
