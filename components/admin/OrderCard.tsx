"use client";

import { useEffect, useState, useTransition } from "react";
import { formatMoney } from "@/lib/dto/money";
import type { BoardOrderDTO } from "@/lib/orders/dto";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import { advanceOrderStatusAction, collectCashPaymentAction } from "@/lib/orders/board-actions";
import { getNextStatus } from "@/lib/orders/state-machine";
import { AgingIndicator } from "./AgingIndicator";
import { AllergyIcon } from "./icons";

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

export function OrderCard({
  order,
  dict,
  lang,
  canCancel,
  onCancel,
}: {
  order: BoardOrderDTO;
  dict: AdminDictionary["orders"];
  lang: "en" | "es";
  canCancel: boolean;
  onCancel: (order: BoardOrderDTO) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [isNew, setIsNew] = useState(() => isRecent(order.placedAt));

  useEffect(() => {
    const id = setInterval(() => setIsNew(isRecent(order.placedAt)), 15000);
    return () => clearInterval(id);
  }, [order.placedAt]);

  const nextStatus = getNextStatus(order.status);
  const isDelivered = order.status === "DELIVERED";
  const paymentDue = order.paymentStatus === "PENDING";

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
          <div className="font-display text-[20px] font-bold tabular-nums text-on-surface">
            {order.orderNumber}
          </div>
          <div className="mt-[2px] text-[11.5px] font-semibold uppercase tracking-wide text-on-surface-muted">
            {order.tableLabel ? dict.table.replace("{code}", order.tableLabel) : dict.takeaway}
          </div>
        </div>
        {!isDelivered && (
          <AgingIndicator placedAt={order.placedAt} newLabel={isNew ? dict.new : undefined} />
        )}
      </div>

      <ul className="mb-sm flex flex-col gap-[5px]">
        {order.items.map((item) => (
          <li key={item.id} className="text-[13.5px] leading-snug text-on-surface">
            <span className="font-bold text-primary">{item.quantity}×</span> {item.name}
            {item.modifiers.length > 0 && (
              <span className="ml-[22px] block text-[11.5px] text-on-surface-muted">
                {item.modifiers.join(" · ")}
              </span>
            )}
          </li>
        ))}
      </ul>

      {order.notes && (
        <div className="mb-sm flex items-start gap-[7px] rounded-sm border border-error/25 bg-error/10 px-sm py-[8px] text-[12px] font-medium leading-snug text-error">
          <AllergyIcon />
          <span>{order.notes}</span>
        </div>
      )}

      <div className="mb-sm flex items-center justify-between">
        <span
          className={`rounded-sm px-sm py-[3px] text-[11px] font-semibold ${
            paymentDue ? "bg-warning/12 text-warning" : "bg-success/12 text-success"
          }`}
        >
          {paymentDue ? dict.paymentPending : dict.paymentPaid}
        </span>
        <span className="text-[12px] font-semibold tabular-nums text-on-surface-muted">
          {formatMoney(order.total, order.currency, lang)}
        </span>
      </div>

      {isDelivered ? (
        <div className="flex items-center gap-[8px] text-[12.5px] font-semibold text-success">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
          {paymentDue && order.paymentProvider === "CASH_REGISTER" && (
            <button
              type="button"
              onClick={collectCash}
              disabled={pending}
              className="min-h-[48px] rounded-sm border border-border/40 text-[13.5px] font-semibold text-on-surface transition-colors hover:bg-surface-subtle disabled:opacity-50"
            >
              {dict.collectCash}
            </button>
          )}
          {nextStatus && (
            <button
              type="button"
              onClick={advance}
              disabled={pending}
              className={`flex min-h-[52px] items-center justify-center gap-[8px] rounded-sm text-[14.5px] font-bold text-on-primary transition-colors disabled:opacity-50 ${
                nextStatus === "DELIVERED" ? "bg-success" : "bg-primary hover:bg-primary-hover"
              }`}
            >
              {dict[ADVANCE_LABEL_KEY[order.status as keyof typeof ADVANCE_LABEL_KEY]]}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              onClick={() => onCancel(order)}
              className="min-h-[36px] text-[12px] font-medium text-error underline decoration-error/40 underline-offset-2"
            >
              {dict.cancelOrder}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
