"use client";

import { useEffect, useState, useTransition } from "react";
import type { BoardOrderDTO } from "@/lib/orders/dto";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import { advanceOrderStatusAction } from "@/lib/orders/board-actions";
import { getNextStatus } from "@/lib/orders/state-machine";
import { AgingIndicator, elapsedMinutes, agingTier } from "@/components/admin/AgingIndicator";
import { AllergyIcon, SingleTableIcon, TakeawayBagIcon } from "@/components/admin/icons";

type KitchenDict = AdminDictionary["kitchen"];

const ADVANCE_LABEL_KEY = {
  PENDING: "advanceStart",
  PREPARING: "advanceReady",
} as const;

const NEW_ORDER_WINDOW_MS = 60_000;

function isRecent(placedAt: string): boolean {
  return Date.now() - new Date(placedAt).getTime() < NEW_ORDER_WINDOW_MS;
}

/**
 * The kitchen screen's own card — not a density variant of OrderCard.tsx.
 * No price, no payment badge, no cancel link: this surface doesn't have
 * them per the module's own rule, so there's no prop to hide them behind,
 * there's simply no code path that could render them. Per-item notes sit
 * right under the dish they modify (item.notes, which the /admin/pedidos
 * board's own OrderCard never renders) instead of being folded into a
 * general note at the bottom — that's what keeps "sin cebolla" from
 * competing with the dish name for a second read.
 *
 * Sized for the 20-orders-at-once case, not the 1-order case: legible at
 * three meters still means something has to give when the grid packs
 * several rows of cards into a 1080p column without scrolling, so this
 * scale sits below OrdersBoard's own "kitchen" density (that one only ever
 * shows a handful of cards in a single wide list, never a dense grid).
 */
export function KitchenOrderCard({ order, dict }: { order: BoardOrderDTO; dict: KitchenDict }) {
  const [pending, startTransition] = useTransition();
  const [minutes, setMinutes] = useState(() => elapsedMinutes(order.placedAt));

  useEffect(() => {
    const id = setInterval(() => setMinutes(elapsedMinutes(order.placedAt)), 15000);
    return () => clearInterval(id);
  }, [order.placedAt]);

  const isNew = isRecent(order.placedAt);
  const tier = agingTier(minutes);
  const nextStatus = getNextStatus(order.status);
  const isDineIn = order.type === "DINE_IN";

  function advance() {
    startTransition(async () => {
      await advanceOrderStatusAction(order.id);
    });
  }

  return (
    <div
      // The type color (left edge only) and the alarm color (top/right/bottom)
      // are deliberately separate physical sides, not layered border-* /
      // border-l-* utilities on the same sides — those collide on
      // border-left-color and which one wins depends on Tailwind's class
      // generation order, not on anything in this file. Keeping them on
      // different sides means both are always visible at once: mesa vs.
      // llevar on the left, new/stuck-too-long across the rest.
      className={`flex flex-col gap-[5px] rounded-md border-y-[3px] border-r-[3px] border-l-[8px] bg-surface p-[8px] ${
        isDineIn ? "border-l-info" : "border-l-accent-warm-border"
      } ${
        isNew
          ? "animate-kitchen-pulse-new border-y-info border-r-info"
          : tier === "hot"
            ? "animate-kitchen-pulse-hot border-y-error border-r-error"
            : "border-y-transparent border-r-transparent"
      }`}
    >
      <div className="flex items-start justify-between gap-sm">
        <div>
          <div className="font-display text-[30px] font-extrabold leading-none tabular-nums text-on-surface">
            {order.orderNumber}
          </div>
          <div className="mt-[3px] flex items-center gap-[5px] text-[13px] font-bold uppercase tracking-wide text-on-surface-muted">
            {isDineIn ? <SingleTableIcon className="h-[14px] w-[14px]" /> : <TakeawayBagIcon className="h-[14px] w-[14px]" />}
            {isDineIn ? order.tableLabel : dict.takeaway}
          </div>
        </div>
        <AgingIndicator
          placedAt={order.placedAt}
          newLabel={isNew ? dict.new : undefined}
          sizeClassName="gap-[5px] px-[9px] py-[4px] text-[16px]"
          dotClassName="h-[7px] w-[7px]"
        />
      </div>

      <ul className="flex flex-col gap-[3px]">
        {order.items.map((item) => (
          <li key={item.id}>
            <div className="text-[19px] font-bold leading-tight text-on-surface">
              <span className="text-primary">{item.quantity}×</span> {item.name}
            </div>
            {item.modifiers.length > 0 && (
              <div className="ml-[24px] text-[12px] text-on-surface-muted">{item.modifiers.join(" · ")}</div>
            )}
            {item.notes && (
              <div className="mt-[3px] flex items-start gap-[6px] rounded-sm border border-error/30 bg-error/10 px-[8px] py-[5px] text-[14px] font-bold leading-snug text-error">
                <AllergyIcon className="mt-[2px] h-[14px] w-[14px]" />
                {item.notes}
              </div>
            )}
          </li>
        ))}
      </ul>

      {order.notes && (
        <div className="flex items-start gap-[6px] rounded-sm border border-error/30 bg-error/10 px-[8px] py-[6px] text-[13px] font-semibold leading-snug text-error">
          <AllergyIcon className="mt-[1px] h-[13px] w-[13px]" />
          {order.notes}
        </div>
      )}

      {nextStatus ? (
        <button
          type="button"
          onClick={advance}
          disabled={pending}
          className={`min-h-[42px] rounded-md text-[18px] font-bold text-on-primary transition-colors disabled:opacity-50 ${
            nextStatus === "READY" ? "bg-success hover:bg-success" : "bg-primary hover:bg-primary-hover"
          }`}
        >
          {dict[ADVANCE_LABEL_KEY[order.status as keyof typeof ADVANCE_LABEL_KEY]]}
        </button>
      ) : (
        <div className="flex min-h-[42px] items-center justify-center rounded-md bg-success/12 text-[14px] font-bold text-success">
          {dict.waitingPickup}
        </div>
      )}
    </div>
  );
}
