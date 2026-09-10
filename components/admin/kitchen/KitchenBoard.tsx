"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BoardOrderDTO } from "@/lib/orders/dto";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import { useEventStream } from "@/lib/realtime/useEventStream";
import { playChime, primeAudio } from "@/lib/realtime/chime";
import { getPrinterStatusAction } from "@/lib/devices/actions";
import { KitchenColumn } from "./KitchenColumn";
import { KitchenOrderCard } from "./KitchenOrderCard";
import { SoundOnIcon, SoundOffIcon } from "@/components/admin/icons";

type KitchenDict = AdminDictionary["kitchen"];

const SOUND_STORAGE_KEY = "marea-kitchen-sound";
// Thirty times the agent's own poll interval (module 13, Fase 2 decision):
// generous margin for a network hiccup before this reads as real trouble.
const PRINTER_OFFLINE_AFTER_MS = 60_000;
const PRINTER_POLL_MS = 20_000;

const COLUMNS = [
  { status: "PENDING", key: "columnPending" },
  { status: "PREPARING", key: "columnPreparing" },
  { status: "READY", key: "columnReady" },
] as const;

function usePersistedSound(): [boolean, () => void] {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SOUND_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored !== null) setEnabled(stored === "1");
    } catch {
      // Private browsing / storage blocked — sound just defaults on for this load.
    }
  }, []);

  const toggle = useCallback(() => {
    primeAudio();
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SOUND_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Nothing to persist to — the toggle still works for this session.
      }
      return next;
    });
  }, []);

  return [enabled, toggle];
}

/** Keeps the TV screen awake — a kitchen display left alone for hours is exactly the case the Screen Wake Lock API exists for. Silently a no-op on a browser that doesn't support it. */
function useWakeLock() {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let sentinel: { release: () => Promise<void> } | null = null;

    async function acquire() {
      try {
        sentinel = await (navigator as unknown as { wakeLock: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock.request("screen");
      } catch {
        // Denied or unsupported in this context — nothing to fall back to.
      }
    }

    acquire();
    function onVisibilityChange() {
      if (document.visibilityState === "visible") acquire();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      sentinel?.release().catch(() => {});
    };
  }, []);
}

function useFullscreen(): [boolean, () => void] {
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    function onChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  return [isFullscreen, toggle];
}

/** Polled independently of the order SSE stream — a quiet kitchen with no new orders for a while would otherwise never learn its printer went dark, since the stream only ever signals order/payment changes. */
type PrinterStatus = { state: "unknown" } | { state: "online" } | { state: "offline"; minutes: number };

function derivePrinterStatus(lastSeenAt: string | null): PrinterStatus {
  if (!lastSeenAt) return { state: "unknown" };
  const ageMs = Date.now() - new Date(lastSeenAt).getTime();
  return ageMs < PRINTER_OFFLINE_AFTER_MS
    ? { state: "online" }
    : { state: "offline", minutes: Math.floor(ageMs / 60000) };
}

function usePrinterStatus(initialLastSeenAt: string | null) {
  // A ref, not state — it only ever feeds the tick interval below, and
  // writing it doesn't need to trigger a render of its own; the interval's
  // own setState is what does that, on its own schedule.
  const lastSeenAtRef = useRef(initialLastSeenAt);
  // Derived in state, ticked on an interval — never computed straight from
  // Date.now() during render (same reasoning as AgingIndicator's own
  // elapsedMinutes: a value that changes with the clock has to live in
  // state, read back pure on render) and never set synchronously inside an
  // effect body, only from the interval's own callback.
  const [status, setStatus] = useState<PrinterStatus>(() => derivePrinterStatus(initialLastSeenAt));

  useEffect(() => {
    const tick = setInterval(() => setStatus(derivePrinterStatus(lastSeenAtRef.current)), 15_000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const result = await getPrinterStatusAction();
        lastSeenAtRef.current = result.lastSeenAt;
      } catch {
        // A failed poll leaves the last known state on screen rather than flashing to "unknown".
      }
    }, PRINTER_POLL_MS);
    return () => clearInterval(poll);
  }, []);

  return status;
}

export function KitchenBoard({
  orders,
  dict,
  printerLastSeenAt,
}: {
  orders: BoardOrderDTO[];
  dict: KitchenDict;
  printerLastSeenAt: string | null;
}) {
  const router = useRouter();
  const [soundEnabled, toggleSound] = usePersistedSound();
  const [isFullscreen, toggleFullscreen] = useFullscreen();
  const printer = usePrinterStatus(printerLastSeenAt);
  useWakeLock();

  useEventStream("/api/orders/stream", () => router.refresh());

  const knownOrderIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    const currentIds = new Set(orders.map((o) => o.id));
    if (knownOrderIds.current) {
      const hasNewOrder = [...currentIds].some((id) => !knownOrderIds.current!.has(id));
      if (hasNewOrder && soundEnabled) playChime();
    }
    knownOrderIds.current = currentIds;
  }, [orders, soundEnabled]);

  useEffect(() => {
    function primeOnce() {
      primeAudio();
      window.removeEventListener("pointerdown", primeOnce);
    }
    window.addEventListener("pointerdown", primeOnce);
    return () => window.removeEventListener("pointerdown", primeOnce);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-surface">
      <div className="flex flex-none items-center justify-end gap-[10px] border-b border-border/20 px-[16px] py-[8px]">
        <span
          className={`rounded-full px-[14px] py-[6px] text-[14px] font-semibold ${
            printer.state === "online"
              ? "bg-success/12 text-success"
              : printer.state === "offline"
                ? "bg-error/14 text-error"
                : "bg-border/16 text-on-surface-muted"
          }`}
        >
          {printer.state === "online"
            ? dict.printerOnline
            : printer.state === "offline"
              ? dict.printerOffline.replace("{minutes}", String(printer.minutes))
              : dict.printerUnknown}
        </span>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="rounded-full border border-border/30 px-[14px] py-[6px] text-[14px] font-medium text-on-surface-muted"
        >
          {isFullscreen ? dict.exitFullscreen : dict.fullscreen}
        </button>
        <button
          type="button"
          onClick={toggleSound}
          aria-label={soundEnabled ? dict.soundOff : dict.soundOn}
          className="flex h-[36px] w-[36px] items-center justify-center rounded-full border border-border/30 text-on-surface-muted"
        >
          {soundEnabled ? <SoundOnIcon /> : <SoundOffIcon />}
        </button>
      </div>

      <div className="flex flex-1 gap-[1px] overflow-hidden bg-border/20">
        {COLUMNS.map(({ status, key }) => {
          const columnOrders = orders.filter((o) => o.status === status);
          return (
            <KitchenColumn key={status} title={dict[key]} count={columnOrders.length} emptyLabel={dict.emptyColumn}>
              {columnOrders.map((order) => (
                <KitchenOrderCard key={order.id} order={order} dict={dict} />
              ))}
            </KitchenColumn>
          );
        })}
      </div>
    </div>
  );
}
