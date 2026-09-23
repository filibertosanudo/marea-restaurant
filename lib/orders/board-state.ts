import type { BoardOrderDTO } from "@/lib/orders/dto";
import type { BoardColumnStatus } from "@/lib/orders/state-machine";
import { encodeBoardCursor } from "@/lib/orders/board-cursor";

// The board's client-side model, as plain functions over plain data so every
// rule about it can be tested without React or a browser: a snapshot from the
// server, deltas for single cards, pages loaded on demand, and optimistic
// moves layered on top. The hook that holds it in React is glue.

export const COLUMN_STATUSES: readonly BoardColumnStatus[] = ["PENDING", "PREPARING", "READY", "DELIVERED"];

export type ColumnTotals = Record<BoardColumnStatus, number>;

export const EMPTY_TOTALS: ColumnTotals = { PENDING: 0, PREPARING: 0, READY: 0, DELIVERED: 0 };

export type BoardState = {
  /** Cards this screen holds, by id. A column's total can exceed what is held: the rest is a page away. */
  orders: Record<string, BoardOrderDTO>;
  /** How many cards each column has on the server. The badge shows this, not the loaded count. */
  totals: ColumnTotals;
  /** DELIVERED cards are not part of the first paint; false until they have been asked for. */
  deliveredLoaded: boolean;
};

function isColumn(status: string): status is BoardColumnStatus {
  return (COLUMN_STATUSES as readonly string[]).includes(status);
}

/** Oldest first, id as the tie-break: the same order the server pages by. */
function compareCards(a: BoardOrderDTO, b: BoardOrderDTO): number {
  if (a.placedAt !== b.placedAt) return a.placedAt < b.placedAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function fromSnapshot(orders: BoardOrderDTO[], totals: ColumnTotals): BoardState {
  return {
    orders: Object.fromEntries(orders.map((order) => [order.id, order])),
    totals: { ...totals },
    deliveredLoaded: false,
  };
}

export function columnCards(state: BoardState, status: BoardColumnStatus): BoardOrderDTO[] {
  return Object.values(state.orders)
    .filter((order) => order.status === status)
    .sort(compareCards);
}

/** Whether the column has cards this screen does not hold. For DELIVERED that is "not asked for yet" too. */
export function hasMore(state: BoardState, status: BoardColumnStatus): boolean {
  if (status === "DELIVERED" && !state.deliveredLoaded) return state.totals.DELIVERED > 0;
  return state.totals[status] > columnCards(state, status).length;
}

/** Where the next page of a column starts, or null for the first page. */
export function nextCursor(state: BoardState, status: BoardColumnStatus): string | null {
  const cards = columnCards(state, status);
  const last = cards[cards.length - 1];
  return last ? encodeBoardCursor({ placedAt: last.placedAt, id: last.id }) : null;
}

/**
 * Applies the cards a live event named. `found` are the cards the server still
 * has for the ids asked (in any status); `missing` are the ids it does not
 * show this view (deleted, another business, hidden by the board's filter).
 * `totals` is the server's own count from the same request: totals are never
 * adjusted by hand, because a card this screen never held is ambiguous (a new
 * order, or one that was a page away and just moved).
 *
 * A card belongs in the loaded set only if it falls inside the loaded window
 * of its column, or the column is fully loaded. Otherwise it is left for
 * "ver más", which keeps the loaded window contiguous.
 */
export function applyDelta(
  state: BoardState,
  found: BoardOrderDTO[],
  missing: string[],
  totals: ColumnTotals
): { state: BoardState; added: string[] } {
  const orders = { ...state.orders };
  const added: string[] = [];

  for (const id of missing) delete orders[id];

  for (const card of found) {
    const previous = orders[card.id];
    delete orders[card.id];
    if (!isColumn(card.status)) continue; // CANCELLED: gone from the board
    if (card.status === "DELIVERED" && !state.deliveredLoaded) continue;

    const column = Object.values(orders)
      .filter((order) => order.status === card.status)
      .sort(compareCards);
    const last = column[column.length - 1];
    const fullyLoaded = totals[card.status] <= column.length + 1; // this card is the one to add
    const insideWindow = last !== undefined && compareCards(card, last) < 0;
    if (fullyLoaded || insideWindow) {
      orders[card.id] = card;
      if (!previous) added.push(card.id);
    }
  }

  return { state: { ...state, orders, totals: { ...totals } }, added };
}

/** Adds a loaded page ("ver más", or the DELIVERED column asked for) without touching what is already held. */
export function mergePage(
  state: BoardState,
  status: BoardColumnStatus,
  page: BoardOrderDTO[],
  totals?: ColumnTotals
): BoardState {
  const orders = { ...state.orders };
  for (const card of page) {
    if (card.status === status && !(card.id in orders)) orders[card.id] = card;
  }
  return {
    orders,
    totals: totals ? { ...totals } : state.totals,
    deliveredLoaded: state.deliveredLoaded || status === "DELIVERED",
  };
}

/** A view of the board with optimistic moves applied: the card sits in its new column now, whatever the server has said so far. */
export type BoardView = { columns: Record<BoardColumnStatus, BoardOrderDTO[]>; totals: ColumnTotals };

export function viewOf(state: BoardState, moves: Record<string, BoardColumnStatus>): BoardView {
  const totals = { ...state.totals };
  const cards = Object.values(state.orders).map((card) => {
    const target = moves[card.id];
    if (!target || target === card.status) return card;
    if (isColumn(card.status)) totals[card.status] = Math.max(0, totals[card.status] - 1);
    totals[target] += 1;
    return { ...card, status: target };
  });
  const columns = { PENDING: [], PREPARING: [], READY: [], DELIVERED: [] } as Record<BoardColumnStatus, BoardOrderDTO[]>;
  for (const card of cards) {
    if (isColumn(card.status)) columns[card.status].push(card);
  }
  for (const status of COLUMN_STATUSES) columns[status].sort(compareCards);
  return { columns, totals };
}
