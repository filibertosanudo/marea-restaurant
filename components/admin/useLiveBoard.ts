"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BoardOrderDTO } from "@/lib/orders/dto";
import { advanceOrderStatusAction } from "@/lib/orders/board-actions";
import { getNextStatus, type BoardColumnStatus } from "@/lib/orders/state-machine";
import {
  applyDelta,
  carryDelivered,
  fromSnapshot,
  hasMore as columnHasMore,
  mergePage,
  nextCursor,
  viewOf,
  COLUMN_STATUSES,
  type BoardState,
  type ColumnTotals,
} from "@/lib/orders/board-state";
import { boardCardsUrl, boardPageUrl, type BoardApiFilters } from "@/lib/orders/board-api";
import { useEventStream, type StreamPayload } from "@/lib/realtime/useEventStream";

/** The full re-read that catches whatever a lost event, a hidden tab or a bug left stale. */
export const RECONCILE_INTERVAL_MS = 60_000;
/** Events for one order arrive as a few triggers; wait this long so one request carries them all. */
const DELTA_BATCH_MS = 50;
/** More than this in one go, and re-reading everything is cheaper than asking for cards. */
const MAX_DELTA_IDS = 50;
/** Focus and visibility both fire when a tab comes back; one refresh is enough. */
const MIN_REFRESH_GAP_MS = 2_000;

type Options = {
  /** What the server rendered: the first page of each live column, and every column's total. */
  orders: BoardOrderDTO[];
  totals: ColumnTotals;
  filters: BoardApiFilters;
  /** False on a tab that shows no columns (the cancelled list): every event re-reads the page instead of fetching cards. */
  deltas: boolean;
  /** The board shows a delivered column, asked for after first paint; the kitchen screen has none. */
  includeDelivered: boolean;
  /** The till widget on the board is server-rendered, so a cash event re-reads the page; the kitchen has no till. */
  refreshOnCash: boolean;
  onNewOrders: () => void;
};

/**
 * Keeps a board live without re-rendering it on the server for every event.
 *
 * The server's render is the truth and arrives as props; between renders a
 * live event names the orders that changed and only those cards are fetched
 * (`/api/orders/board`). A fresh render (a reconcile every minute, when the tab
 * regains focus, after a dropped stream, or when an event cannot say what
 * changed) replaces what the screen holds. Advancing a card moves it at once
 * and puts it back if the action fails.
 */
export function useLiveBoard({ orders, totals, filters, deltas, includeDelivered, refreshOnCash, onNewOrders }: Options) {
  const router = useRouter();
  const filterKey = `${filters.type ?? ""}|${filters.table ?? ""}`;

  const [state, setState] = useState<BoardState>(() => fromSnapshot(orders, totals));
  const [moves, setMoves] = useState<Record<string, BoardColumnStatus>>({});
  const [chimeTick, setChimeTick] = useState(0);
  const [loadingMore, setLoadingMore] = useState<Partial<Record<BoardColumnStatus, boolean>>>({});
  const [deliveredAskedFor, setDeliveredAskedFor] = useState<string | null>(null);

  // A fresh render from the server replaces the held cards. Adjusting state
  // while rendering, keyed on the props' identity, is the supported way to
  // derive state from props without an effect that renders twice.
  const [renderedFrom, setRenderedFrom] = useState({ orders, filterKey });
  if (renderedFrom.orders !== orders) {
    setRenderedFrom({ orders, filterKey });
    const fresh = fromSnapshot(orders, totals);
    const sameView = renderedFrom.filterKey === filterKey;
    const held = new Set(Object.keys(state.orders));
    if (orders.some((order) => !held.has(order.id))) setChimeTick((tick) => tick + 1);
    setState(sameView ? carryDelivered(fresh, state) : fresh);
    if (!sameView) setDeliveredAskedFor(null);
    setMoves({});
  }

  const stateRef = useRef(state);
  const filtersRef = useRef(filters);
  useEffect(() => {
    stateRef.current = state;
    filtersRef.current = filters;
  }, [state, filters]);

  const commit = useCallback((next: BoardState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const onNewOrdersRef = useRef(onNewOrders);
  useEffect(() => {
    onNewOrdersRef.current = onNewOrders;
  }, [onNewOrders]);
  useEffect(() => {
    if (chimeTick > 0) onNewOrdersRef.current();
  }, [chimeTick]);

  // --- live deltas -------------------------------------------------------

  const queue = useRef<Set<string>>(new Set());
  const batchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const lastRefreshAt = useRef(0);

  const refresh = useCallback(() => {
    lastRefreshAt.current = Date.now();
    router.refresh();
  }, [router]);

  // The timer calls through a ref so `flush` can schedule its own next run
  // without referring to itself.
  const flushRef = useRef<() => void>(() => {});
  const scheduleFlush = useCallback(() => {
    if (!batchTimer.current) batchTimer.current = setTimeout(() => flushRef.current(), DELTA_BATCH_MS);
  }, []);

  const flush = useCallback(async () => {
    batchTimer.current = null;
    if (inFlight.current) {
      scheduleFlush();
      return;
    }
    const ids = [...queue.current].slice(0, MAX_DELTA_IDS);
    for (const id of ids) queue.current.delete(id);
    if (ids.length === 0) return;

    inFlight.current = true;
    try {
      const response = await fetch(boardCardsUrl(ids, filtersRef.current), { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`board cards: ${response.status}`);
      const body = (await response.json()) as { orders: BoardOrderDTO[]; missing: string[]; totals: ColumnTotals };
      const result = applyDelta(stateRef.current, body.orders, body.missing, body.totals);
      commit(result.state);
      if (result.added.length > 0) setChimeTick((tick) => tick + 1);
      // The server has spoken for these orders: whatever was guessed for them is over.
      setMoves((current) => {
        const settled = new Set(ids);
        const remaining = Object.fromEntries(Object.entries(current).filter(([id]) => !settled.has(id)));
        return Object.keys(remaining).length === Object.keys(current).length ? current : remaining;
      });
    } catch {
      // Cannot say what changed: fall back to the full re-read rather than show a stale card.
      refresh();
    } finally {
      inFlight.current = false;
      if (queue.current.size > 0) scheduleFlush();
    }
  }, [commit, refresh, scheduleFlush]);
  useEffect(() => {
    flushRef.current = () => void flush();
  }, [flush]);

  const onUpdate = useCallback(
    (payload: StreamPayload | null) => {
      if (!deltas || !payload || payload.reconcile || !payload.changes) {
        refresh();
        return;
      }
      if (refreshOnCash && payload.changes.some((change) => change.kind === "cash")) refresh();
      for (const change of payload.changes) {
        if (change.kind !== "cash" && change.orderId) queue.current.add(change.orderId);
      }
      if (queue.current.size > MAX_DELTA_IDS) {
        queue.current.clear();
        refresh();
        return;
      }
      if (queue.current.size > 0) scheduleFlush();
    },
    [deltas, refresh, refreshOnCash, scheduleFlush]
  );

  const streamStatus = useEventStream("/api/orders/stream", onUpdate);

  useEffect(
    () => () => {
      if (batchTimer.current) clearTimeout(batchTimer.current);
    },
    []
  );

  // --- reconcile ---------------------------------------------------------

  useEffect(() => {
    function refreshIfVisible() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefreshAt.current < MIN_REFRESH_GAP_MS) return;
      refresh();
    }
    const timer = setInterval(refreshIfVisible, RECONCILE_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);
    window.addEventListener("focus", refreshIfVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.removeEventListener("focus", refreshIfVisible);
    };
  }, [refresh]);

  // --- pages on demand ---------------------------------------------------

  const loadMore = useCallback(
    async (status: BoardColumnStatus) => {
      setLoadingMore((current) => (current[status] ? current : { ...current, [status]: true }));
      try {
        const cursor = nextCursor(stateRef.current, status);
        const response = await fetch(boardPageUrl(status, cursor, filtersRef.current), {
          headers: { accept: "application/json" },
        });
        if (!response.ok) throw new Error(`board page: ${response.status}`);
        const body = (await response.json()) as { orders: BoardOrderDTO[]; totals: ColumnTotals };
        commit(mergePage(stateRef.current, status, body.orders, body.totals));
      } catch {
        // The button stays; asking again is the retry.
      } finally {
        setLoadingMore((current) => ({ ...current, [status]: false }));
      }
    },
    [commit]
  );

  useEffect(() => {
    if (!includeDelivered || deliveredAskedFor === filterKey) return;
    if (state.deliveredLoaded || state.totals.DELIVERED === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeliveredAskedFor(filterKey);
    void loadMore("DELIVERED");
  }, [includeDelivered, deliveredAskedFor, filterKey, state.deliveredLoaded, state.totals.DELIVERED, loadMore]);

  // --- optimistic advance ------------------------------------------------

  const advance = useCallback(async (order: BoardOrderDTO) => {
    const next = getNextStatus(order.status);
    if (!next || !(COLUMN_STATUSES as readonly string[]).includes(next)) return;
    setMoves((current) => ({ ...current, [order.id]: next as BoardColumnStatus }));
    const putBack = () =>
      setMoves((current) => {
        const rest = { ...current };
        delete rest[order.id];
        return rest;
      });
    try {
      const result = await advanceOrderStatusAction(order.id);
      if (result?.error) putBack();
    } catch {
      putBack();
    }
  }, []);

  const view = useMemo(() => viewOf(state, moves), [state, moves]);

  return {
    view,
    hasMore: (status: BoardColumnStatus) => columnHasMore(state, status),
    loadMore,
    loadingMore,
    advance,
    streamStatus,
  };
}
