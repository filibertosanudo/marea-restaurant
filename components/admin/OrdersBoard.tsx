"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { BoardOrderDTO } from "@/lib/orders/dto";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { Lang } from "@/lib/i18n/lang";
import { OrderCard } from "./OrderCard";
import { KanbanColumn } from "./KanbanColumn";
import { CancelOrderDialog } from "./CancelOrderDialog";
import { OrderPaymentDrawer } from "./OrderPaymentDrawer";
import { BOARD_COLUMNS } from "@/lib/orders/state-machine";
import { SoundOnIcon, SoundOffIcon } from "./icons";
import { useEventStream } from "@/lib/realtime/useEventStream";
import { playChime, primeAudio } from "@/lib/realtime/chime";

const COLUMN_LABEL_KEY = {
  PENDING: "columnPending",
  PREPARING: "columnPreparing",
  READY: "columnReady",
  DELIVERED: "columnDelivered",
} as const;

function buildHref(pathname: string, params: URLSearchParams, patch: Record<string, string | null>) {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function OrdersBoard({
  boardOrders,
  cancelledOrders,
  tables,
  dict,
  paymentsDict,
  lang,
  canCancel,
  canRefund,
  tab,
}: {
  boardOrders: BoardOrderDTO[];
  cancelledOrders: BoardOrderDTO[];
  tables: { id: string; code: string; zone: string | null }[];
  dict: AdminDictionary["orders"];
  paymentsDict: AdminDictionary["payments"];
  lang: Lang;
  canCancel: boolean;
  canRefund: boolean;
  tab: "board" | "cancelled";
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [cancelTarget, setCancelTarget] = useState<BoardOrderDTO | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<BoardOrderDTO | null>(null);
  // localStorage, not a cookie: this is a per-device preference (the kitchen
  // display and a waiter's phone shouldn't share it), same pattern as
  // marea-theme.
  const [soundEnabled, setSoundEnabled] = useState(true);
  useEffect(() => {
    const stored = localStorage.getItem("marea-orders-sound");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored !== null) setSoundEnabled(stored === "1");
  }, []);
  function onToggleSound() {
    primeAudio();
    setSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("marea-orders-sound", next ? "1" : "0");
      return next;
    });
  }

  // Sound defaults on, so most staff never touch the toggle button — priming
  // only there would leave the AudioContext permanently "suspended" and the
  // chime would silently never play. Browsers unlock audio on ANY user
  // gesture, so listen for the first one anywhere on the page instead.
  useEffect(() => {
    function primeOnce() {
      primeAudio();
      window.removeEventListener("pointerdown", primeOnce);
      window.removeEventListener("keydown", primeOnce);
    }
    window.addEventListener("pointerdown", primeOnce);
    window.addEventListener("keydown", primeOnce);
    return () => {
      window.removeEventListener("pointerdown", primeOnce);
      window.removeEventListener("keydown", primeOnce);
    };
  }, []);

  const router = useRouter();
  const streamUrl = "/api/orders/stream";
  const streamStatus = useEventStream(streamUrl, () => router.refresh());

  // Chime only for a genuinely NEW order arriving, not every status click —
  // detected by diffing the set of order ids this render got against the
  // previous one, after a stream-triggered refresh brings fresh props in.
  const knownOrderIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    const currentIds = new Set(boardOrders.map((o) => o.id));
    if (knownOrderIds.current) {
      const hasNewOrder = [...currentIds].some((id) => !knownOrderIds.current!.has(id));
      if (hasNewOrder && soundEnabled) playChime();
    }
    knownOrderIds.current = currentIds;
  }, [boardOrders, soundEnabled]);

  const activeType = searchParams.get("type");
  const activeTable = searchParams.get("table");

  const filterBar = (
    <div className="flex flex-wrap items-center gap-[8px]">
      {[
        { label: dict.filterAll, value: null },
        { label: dict.filterDineIn, value: "DINE_IN" },
        { label: dict.filterTakeaway, value: "TAKEAWAY" },
      ].map((opt) => (
        <Link
          key={opt.label}
          href={buildHref(pathname, searchParams, { type: opt.value })}
          className={`rounded-sm border px-sm py-[7px] text-[12.5px] font-medium transition-colors ${
            activeType === opt.value
              ? "border-surface-ocean-border/40 bg-surface-ocean text-primary"
              : "border-border/30 bg-surface-subtle text-on-surface-muted hover:text-on-surface"
          }`}
        >
          {opt.label}
        </Link>
      ))}
      {tables.length > 0 && (
        <select
          value={activeTable ?? ""}
          onChange={(e) => {
            window.location.href = buildHref(pathname, searchParams, {
              table: e.target.value || null,
            });
          }}
          className="rounded-sm border border-border/30 bg-surface-subtle px-sm py-[7px] text-[12.5px] font-medium text-on-surface-muted"
        >
          <option value="">{dict.allTables}</option>
          {tables.map((t) => (
            <option key={t.id} value={t.id}>
              {t.zone ? `${t.zone} · ${t.code}` : t.code}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        onClick={onToggleSound}
        aria-label={soundEnabled ? dict.soundOff : dict.soundOn}
        title={soundEnabled ? dict.soundOff : dict.soundOn}
        className="flex h-[40px] w-[40px] items-center justify-center rounded-sm border border-border/35 bg-surface text-on-surface-muted transition-colors hover:text-on-surface"
      >
        {soundEnabled ? <SoundOnIcon /> : <SoundOffIcon />}
      </button>
    </div>
  );

  const tabsBar = (
    <div className="flex gap-[4px] rounded-md bg-surface-subtle p-[3px]">
      <Link
        href={buildHref(pathname, searchParams, { tab: null })}
        className={`rounded-sm px-md py-[8px] text-[13px] font-medium transition-colors ${
          tab === "board" ? "bg-surface text-primary shadow-1" : "text-on-surface-muted"
        }`}
      >
        {dict.tabBoard}
      </Link>
      <Link
        href={buildHref(pathname, searchParams, { tab: "cancelled" })}
        className={`rounded-sm px-md py-[8px] text-[13px] font-medium transition-colors ${
          tab === "cancelled" ? "bg-surface text-primary shadow-1" : "text-on-surface-muted"
        }`}
      >
        {dict.tabCancelled}
      </Link>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-none flex-wrap items-center justify-between gap-md border-b border-border/25 bg-surface px-lg py-md">
        <div className="flex flex-wrap items-center gap-md">
          <h1 className="font-display text-[24px] font-semibold text-on-surface md:text-[26px]">
            {dict.title}
          </h1>
          {streamStatus === "offline" ? (
            <span className="inline-flex items-center gap-[6px] rounded-sm bg-error/12 px-sm py-[5px] text-[12.5px] font-semibold text-error">
              <span className="h-[7px] w-[7px] rounded-full bg-error" />
              {dict.offline}
            </span>
          ) : (
            <span className="inline-flex items-center gap-[6px] rounded-sm bg-success/12 px-sm py-[5px] text-[12.5px] font-semibold text-success">
              <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-success" />
              {dict.live}
            </span>
          )}
          {tabsBar}
        </div>
        {filterBar}
      </div>

      {tab === "cancelled" ? (
        <div className="flex-1 overflow-y-auto p-lg">
          {cancelledOrders.length === 0 ? (
            <p className="text-center text-[13px] text-on-surface-muted">{dict.emptyCancelled}</p>
          ) : (
            <div className="flex flex-col gap-sm">
              {cancelledOrders.map((order) => (
                <div
                  key={order.id}
                  className="rounded-md border border-border/25 bg-surface p-md text-[13px]"
                >
                  <div className="mb-[4px] flex items-center justify-between">
                    <span className="font-display text-[16px] font-bold text-on-surface">
                      {order.orderNumber}
                    </span>
                    <span className="text-[11.5px] font-semibold uppercase text-on-surface-muted">
                      {order.tableLabel ? dict.table.replace("{code}", order.tableLabel) : dict.takeaway}
                    </span>
                  </div>
                  <p className="text-on-surface-muted">{order.notes ?? ""}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Desktop / kiosk: columns. */}
          <div className="hidden flex-1 grid-cols-4 gap-[1px] overflow-hidden bg-border/25 md:grid">
            {BOARD_COLUMNS.map(({ status }) => {
              const columnOrders = boardOrders.filter((o) => o.status === status);
              return (
                <KanbanColumn
                  key={status}
                  title={dict[COLUMN_LABEL_KEY[status]]}
                  count={columnOrders.length}
                  emptyLabel={dict.emptyColumn}
                  density="kitchen"
                >
                  {columnOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      dict={dict}
                      lang={lang}
                      canCancel={canCancel}
                      onCancel={setCancelTarget}
                      onViewPayment={setPaymentTarget}
                      density="kitchen"
                    />
                  ))}
                </KanbanColumn>
              );
            })}
          </div>

          {/* Waiter view: compact list, filterable by status pills. */}
          <MobileOrderList
            orders={boardOrders}
            dict={dict}
            lang={lang}
            canCancel={canCancel}
            onCancel={setCancelTarget}
            onViewPayment={setPaymentTarget}
          />
        </>
      )}

      <CancelOrderDialog order={cancelTarget} dict={dict} onClose={() => setCancelTarget(null)} />
      <OrderPaymentDrawer
        orderId={paymentTarget?.id ?? null}
        open={paymentTarget !== null}
        onClose={() => setPaymentTarget(null)}
        canRefund={canRefund}
        lang={lang}
        dict={paymentsDict}
      />
    </div>
  );
}

function MobileOrderList({
  orders,
  dict,
  lang,
  canCancel,
  onCancel,
  onViewPayment,
}: {
  orders: BoardOrderDTO[];
  dict: AdminDictionary["orders"];
  lang: Lang;
  canCancel: boolean;
  onCancel: (order: BoardOrderDTO) => void;
  onViewPayment: (order: BoardOrderDTO) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<(typeof BOARD_COLUMNS)[number]["status"]>("PENDING");
  const filtered = orders.filter((o) => o.status === statusFilter);

  return (
    <div className="flex flex-1 flex-col md:hidden">
      <div className="flex flex-none gap-[6px] overflow-x-auto border-b border-border/20 bg-surface px-md py-sm">
        {BOARD_COLUMNS.map(({ status }) => {
          const count = orders.filter((o) => o.status === status).length;
          return (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`flex-none rounded-sm px-sm py-[7px] text-[12px] font-medium transition-colors ${
                statusFilter === status
                  ? "bg-surface-ocean text-primary"
                  : "bg-surface-subtle text-on-surface-muted"
              }`}
            >
              {dict[COLUMN_LABEL_KEY[status]]} <span className="font-bold">{count}</span>
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto p-md">
        {filtered.length === 0 ? (
          <p className="py-lg text-center text-[13px] text-on-surface-muted">{dict.emptyColumn}</p>
        ) : (
          <div className="flex flex-col gap-sm">
            {filtered.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                dict={dict}
                lang={lang}
                canCancel={canCancel}
                onCancel={onCancel}
                onViewPayment={onViewPayment}
                density="waiter"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
