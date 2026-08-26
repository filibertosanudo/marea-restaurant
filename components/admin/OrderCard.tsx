"use client";

import { useEffect, useState, useTransition } from "react";
import { formatMoney } from "@/lib/dto/money";
import type { BoardOrderDTO } from "@/lib/orders/dto";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import { advanceOrderStatusAction, collectCashPaymentAction } from "@/lib/orders/board-actions";
import { getNextStatus } from "@/lib/orders/state-machine";
import { AgingIndicator } from "./AgingIndicator";
import { AllergyIcon } from "./icons";
import type { PaymentReading } from "@/lib/orders/dto";

/**
 * The board's two surfaces are the same data, read from two different
 * distances: a kitchen display bolted to a wall and read at arm's length by
 * gloved hands, versus a waiter's own phone held a few inches away. Same
 * component, same props, one variant — not a `md:` breakpoint (the two
 * don't correspond to viewport width, a kiosk and a phone can both be
 * "desktop-sized" or not) and not a duplicated component (the markup and
 * behavior are identical, only the type scale changes).
 */
export type BoardDensity = "kitchen" | "waiter";

const ADVANCE_LABEL_KEY = {
  PENDING: "advanceFromPending",
  PREPARING: "advanceFromPreparing",
  READY: "advanceFromReady",
} as const;

// How long a just-placed order gets the "new" pulse border + badge. Owned
// here (not passed from the board) so it ticks on its own, same reasoning
// as AgingIndicator not taking a parent-computed value.
const NEW_ORDER_WINDOW_MS = 60_000;

function isRecent(placedAt: string): boolean {
  return Date.now() - new Date(placedAt).getTime() < NEW_ORDER_WINDOW_MS;
}

// The waiter scale is exactly what this card already used before density
// existed — unchanged on purpose, per the module's own requirement that the
// compact view doesn't move. The kitchen scale is the fix: legible at three
// meters, ~40-60px for the folio and the order lines, the rest in
// proportion.
const SCALE = {
  kitchen: {
    folio: "text-[52px] leading-none",
    tableLabel: "text-[18px] tracking-wide",
    aging: "text-[22px] gap-[8px] px-[14px] py-[8px]",
    agingDot: "h-[10px] w-[10px]",
    itemGap: "gap-[12px]",
    // The other half of "40-60px for the folio and the order lines" — the
    // dish name/quantity is what a line cook actually reads line by line,
    // arguably more than the folio itself.
    itemName: "text-[44px] leading-tight",
    itemModifiers: "ml-[44px] text-[24px]",
    notes: "gap-[10px] px-md py-[14px] text-[22px]",
    allergyIcon: "h-[24px] w-[24px]",
    paymentBadge: "px-md py-[7px] text-[19px]",
    price: "text-[22px]",
    collectButton: "min-h-[84px] text-[22px]",
    advanceButton: "min-h-[96px] gap-[12px] text-[28px]",
    advanceIcon: 28,
    completed: "gap-[12px] text-[24px]",
    completedIcon: 28,
    cancelLink: "min-h-[46px] text-[18px]",
  },
  waiter: {
    folio: "text-[20px]",
    tableLabel: "text-[11.5px] tracking-wide",
    aging: "gap-[5px] px-[9px] py-[4px] text-[12px]",
    agingDot: "h-[6px] w-[6px]",
    itemGap: "gap-[5px]",
    itemName: "text-[13.5px]",
    itemModifiers: "ml-[22px] text-[11.5px]",
    notes: "gap-[7px] px-sm py-[8px] text-[12px]",
    allergyIcon: "",
    paymentBadge: "min-h-[32px] px-sm py-[6px] text-[11px]",
    price: "text-[12px]",
    collectButton: "min-h-[48px] text-[13.5px]",
    advanceButton: "min-h-[52px] gap-[8px] text-[14.5px]",
    advanceIcon: 16,
    completed: "gap-[8px] text-[12.5px]",
    completedIcon: 16,
    cancelLink: "min-h-[36px] text-[12px]",
  },
} as const;

// bg-border/16 + text-on-surface-muted is the same neutral pair
// status-badge-neutral already uses elsewhere in the panel. REFUNDED reuses
// it too, matching PaymentStatusPill's own REFUNDED mapping (see
// components/admin/PaymentStatusPill.tsx) — the same payment must read as
// the same color on the board card and in the drawer it opens into, which
// is exactly what that shared pill exists to guarantee.
const READING_STYLE: Record<PaymentReading, string> = {
  DUE: "bg-warning/12 text-warning",
  PAID: "bg-success/12 text-success",
  REFUNDED: "bg-border/16 text-on-surface-muted",
  NONE: "bg-border/16 text-on-surface-muted",
};

const READING_LABEL_KEY: Record<PaymentReading, keyof AdminDictionary["orders"]> = {
  DUE: "paymentPending",
  PAID: "paymentPaid",
  REFUNDED: "paymentRefunded",
  NONE: "paymentNone",
};

export function OrderCard({
  order,
  dict,
  lang,
  canCancel,
  onCancel,
  onViewPayment,
  density,
}: {
  order: BoardOrderDTO;
  dict: AdminDictionary["orders"];
  lang: "en" | "es";
  canCancel: boolean;
  onCancel: (order: BoardOrderDTO) => void;
  onViewPayment: (order: BoardOrderDTO) => void;
  density: BoardDensity;
}) {
  const [pending, startTransition] = useTransition();
  const [isNew, setIsNew] = useState(() => isRecent(order.placedAt));
  const s = SCALE[density];

  useEffect(() => {
    const id = setInterval(() => setIsNew(isRecent(order.placedAt)), 15000);
    return () => clearInterval(id);
  }, [order.placedAt]);

  const nextStatus = getNextStatus(order.status);
  const isDelivered = order.status === "DELIVERED";

  function advance() {
    startTransition(async () => {
      await advanceOrderStatusAction(order.id);
    });
  }

  function collectCash() {
    startTransition(async () => {
      await collectCashPaymentAction(order.id);
    });
  }

  return (
    <div
      className={`rounded-md border bg-surface p-md ${
        isNew ? "border-info shadow-[0_0_0_3px_rgb(var(--color-info)/0.18)]" : "border-border/25"
      } ${isDelivered ? "opacity-60" : ""}`}
    >
      <div className="mb-sm flex items-start justify-between gap-sm">
        <div>
          <div className={`font-display font-bold tabular-nums text-on-surface ${s.folio}`}>
            {order.orderNumber}
          </div>
          <div className={`mt-[2px] font-semibold uppercase text-on-surface-muted ${s.tableLabel}`}>
            {order.tableLabel ? dict.table.replace("{code}", order.tableLabel) : dict.takeaway}
          </div>
        </div>
        {!isDelivered && (
          <AgingIndicator
            placedAt={order.placedAt}
            newLabel={isNew ? dict.new : undefined}
            sizeClassName={s.aging}
            dotClassName={s.agingDot}
          />
        )}
      </div>

      <ul className={`mb-sm flex flex-col ${s.itemGap}`}>
        {order.items.map((item) => (
          <li key={item.id} className={`leading-snug text-on-surface ${s.itemName}`}>
            <span className="font-bold text-primary">{item.quantity}×</span> {item.name}
            {item.modifiers.length > 0 && (
              <span className={`block text-on-surface-muted ${s.itemModifiers}`}>
                {item.modifiers.join(" · ")}
              </span>
            )}
          </li>
        ))}
      </ul>

      {order.notes && (
        <div
          className={`mb-sm flex items-start rounded-sm border border-error/25 bg-error/10 font-medium leading-snug text-error ${s.notes}`}
        >
          <AllergyIcon className={s.allergyIcon} />
          <span>{order.notes}</span>
        </div>
      )}

      <div className="mb-sm flex items-center justify-between">
        <button
          type="button"
          onClick={() => onViewPayment(order)}
          aria-label={dict.viewPayment}
          className={`rounded-sm font-semibold underline-offset-2 transition-[opacity,text-decoration] hover:underline active:opacity-60 ${s.paymentBadge} ${READING_STYLE[order.paymentReading]}`}
        >
          {dict[READING_LABEL_KEY[order.paymentReading]]}
        </button>
        <span className={`font-semibold tabular-nums text-on-surface-muted ${s.price}`}>
          {formatMoney(order.total, order.currency, lang)}
        </span>
      </div>

      {isDelivered ? (
        <div className={`flex items-center font-semibold text-success ${s.completed}`}>
          <svg
            width={s.completedIcon}
            height={s.completedIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {dict.completed}
        </div>
      ) : (
        <div className="flex flex-col gap-[8px]">
          {/* Oversized on purpose — this surface is read at arm's length by
              gloved hands, not clicked at a desk, so it steps outside the
              admin panel's usual dense button padding (button-primary-admin)
              while keeping the same rounded-sm/color tokens. */}
          {order.canCollectCash && (
            <button
              type="button"
              onClick={collectCash}
              disabled={pending}
              className={`rounded-sm border border-border/40 font-semibold text-on-surface transition-colors hover:bg-surface-subtle disabled:opacity-50 ${s.collectButton}`}
            >
              {dict.collectCash}
            </button>
          )}
          {nextStatus && (
            <button
              type="button"
              onClick={advance}
              disabled={pending}
              className={`flex items-center justify-center rounded-sm font-bold text-on-primary transition-colors disabled:opacity-50 ${
                s.advanceButton
              } ${nextStatus === "DELIVERED" ? "bg-success" : "bg-primary hover:bg-primary-hover"}`}
            >
              {dict[ADVANCE_LABEL_KEY[order.status as keyof typeof ADVANCE_LABEL_KEY]]}
              <svg
                width={s.advanceIcon}
                height={s.advanceIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              onClick={() => onCancel(order)}
              className={`font-medium text-error underline decoration-error/40 underline-offset-2 ${s.cancelLink}`}
            >
              {dict.cancelOrder}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
