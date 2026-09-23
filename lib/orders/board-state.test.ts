import { describe, it, expect } from "vitest";
import {
  applyDelta,
  carryDelivered,
  columnCards,
  fromSnapshot,
  hasMore,
  mergePage,
  nextCursor,
  viewOf,
  EMPTY_TOTALS,
  type ColumnTotals,
} from "./board-state";
import type { BoardOrderDTO } from "./dto";

function card(id: string, status: BoardOrderDTO["status"], minute: number, overrides: Partial<BoardOrderDTO> = {}): BoardOrderDTO {
  return {
    id,
    orderNumber: `A-${id}`,
    status,
    type: "DINE_IN",
    tableLabel: null,
    notes: null,
    placedAt: new Date(Date.UTC(2026, 8, 19, 18, minute)).toISOString(),
    total: "10.00",
    currency: "MXN",
    paymentReading: "DUE",
    canCollectCash: false,
    printStatus: null,
    items: [],
    ...overrides,
  };
}

const totals = (over: Partial<ColumnTotals> = {}): ColumnTotals => ({ ...EMPTY_TOTALS, ...over });

describe("snapshot", () => {
  it("lists a column oldest first, whatever order the cards arrived in", () => {
    const state = fromSnapshot([card("b", "PENDING", 5), card("a", "PENDING", 1), card("c", "READY", 2)], totals({ PENDING: 2, READY: 1 }));
    expect(columnCards(state, "PENDING").map((c) => c.id)).toEqual(["a", "b"]);
    expect(columnCards(state, "READY").map((c) => c.id)).toEqual(["c"]);
  });

  it("breaks a tie on placedAt by id, the way the server pages", () => {
    const state = fromSnapshot([card("z", "PENDING", 1), card("m", "PENDING", 1)], totals({ PENDING: 2 }));
    expect(columnCards(state, "PENDING").map((c) => c.id)).toEqual(["m", "z"]);
  });

  it("knows a column has more when its total exceeds what is held, and where the next page starts", () => {
    const state = fromSnapshot([card("a", "PENDING", 1), card("b", "PENDING", 2)], totals({ PENDING: 120 }));
    expect(hasMore(state, "PENDING")).toBe(true);
    expect(nextCursor(state, "PENDING")).toBe(`${card("b", "PENDING", 2).placedAt}|b`);
    expect(hasMore(state, "READY")).toBe(false);
    expect(nextCursor(state, "READY")).toBeNull();
  });

  it("treats the delivered column as not loaded yet, even though its badge already counts", () => {
    const state = fromSnapshot([], totals({ DELIVERED: 7 }));
    expect(hasMore(state, "DELIVERED")).toBe(true);
    const loaded = mergePage(state, "DELIVERED", [card("d1", "DELIVERED", 1)], totals({ DELIVERED: 7 }));
    expect(loaded.deliveredLoaded).toBe(true);
    expect(hasMore(loaded, "DELIVERED")).toBe(true); // 1 of 7 held
  });

  it("has nothing to load when no order was delivered", () => {
    expect(hasMore(fromSnapshot([], totals()), "DELIVERED")).toBe(false);
  });
});

describe("a live delta", () => {
  it("adds a new order to a column that is fully loaded, and reports it as new", () => {
    const state = fromSnapshot([card("a", "PENDING", 1)], totals({ PENDING: 1 }));
    const { state: next, added } = applyDelta(state, [card("n", "PENDING", 9)], [], totals({ PENDING: 2 }));
    expect(columnCards(next, "PENDING").map((c) => c.id)).toEqual(["a", "n"]);
    expect(added).toEqual(["n"]);
    expect(next.totals.PENDING).toBe(2);
  });

  it("moves a card to its new column and does not call it new", () => {
    const state = fromSnapshot([card("a", "PENDING", 1)], totals({ PENDING: 1 }));
    const { state: next, added } = applyDelta(state, [card("a", "PREPARING", 1)], [], totals({ PREPARING: 1 }));
    expect(columnCards(next, "PENDING")).toEqual([]);
    expect(columnCards(next, "PREPARING").map((c) => c.id)).toEqual(["a"]);
    expect(added).toEqual([]);
  });

  it("replaces a card in place when only its content changed, such as a payment", () => {
    const state = fromSnapshot([card("a", "PENDING", 1)], totals({ PENDING: 1 }));
    const paid = card("a", "PENDING", 1, { paymentReading: "PAID", canCollectCash: false });
    const { state: next } = applyDelta(state, [paid], [], totals({ PENDING: 1 }));
    expect(next.orders.a.paymentReading).toBe("PAID");
  });

  it("drops a cancelled card and one the server no longer shows this view", () => {
    const state = fromSnapshot([card("a", "PENDING", 1), card("b", "PENDING", 2), card("c", "READY", 3)], totals({ PENDING: 2, READY: 1 }));
    const { state: next } = applyDelta(state, [card("a", "CANCELLED", 1)], ["c"], totals({ PENDING: 1 }));
    expect(Object.keys(next.orders)).toEqual(["b"]);
    expect(next.totals).toEqual(totals({ PENDING: 1 }));
  });

  it("takes the totals from the server rather than adjusting them", () => {
    const state = fromSnapshot([card("a", "PENDING", 1)], totals({ PENDING: 80 }));
    const { state: next } = applyDelta(state, [], [], totals({ PENDING: 83, READY: 2 }));
    expect(next.totals).toEqual(totals({ PENDING: 83, READY: 2 }));
  });

  it("leaves a new card that would sit beyond the loaded window for 'ver más'", () => {
    const loaded = Array.from({ length: 3 }, (_, i) => card(`p${i}`, "PENDING", i));
    const state = fromSnapshot(loaded, totals({ PENDING: 200 }));
    const { state: next, added } = applyDelta(state, [card("late", "PENDING", 50)], [], totals({ PENDING: 201 }));
    expect(next.orders.late).toBeUndefined();
    expect(added).toEqual([]);
    expect(hasMore(next, "PENDING")).toBe(true);
  });

  it("still takes a card that falls inside the loaded window of a column with more", () => {
    const loaded = [card("p1", "PENDING", 10), card("p2", "PENDING", 20)];
    const state = fromSnapshot(loaded, totals({ PENDING: 200 }));
    const { state: next } = applyDelta(state, [card("early", "READY", 15), card("mid", "PENDING", 15)], [], totals({ PENDING: 200, READY: 1 }));
    expect(columnCards(next, "PENDING").map((c) => c.id)).toEqual(["p1", "mid", "p2"]);
    expect(columnCards(next, "READY").map((c) => c.id)).toEqual(["early"]);
  });

  it("does not add delivered cards before the delivered column has been asked for", () => {
    const state = fromSnapshot([card("a", "READY", 1)], totals({ READY: 1 }));
    const { state: next } = applyDelta(state, [card("a", "DELIVERED", 1)], [], totals({ DELIVERED: 1 }));
    expect(next.orders.a).toBeUndefined();
    expect(next.totals.DELIVERED).toBe(1);
  });

  it("adds delivered cards once the column is loaded", () => {
    const opened = mergePage(fromSnapshot([card("a", "READY", 1)], totals({ READY: 1, DELIVERED: 0 })), "DELIVERED", [], totals({ READY: 1 }));
    const { state: next } = applyDelta(opened, [card("a", "DELIVERED", 1)], [], totals({ DELIVERED: 1 }));
    expect(columnCards(next, "DELIVERED").map((c) => c.id)).toEqual(["a"]);
  });
});

describe("loading a page", () => {
  it("adds the page's cards without duplicating what is held", () => {
    const state = fromSnapshot([card("a", "PENDING", 1), card("b", "PENDING", 2)], totals({ PENDING: 4 }));
    const next = mergePage(state, "PENDING", [card("b", "PENDING", 2), card("c", "PENDING", 3), card("d", "PENDING", 4)]);
    expect(columnCards(next, "PENDING").map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
    expect(hasMore(next, "PENDING")).toBe(false);
  });

  it("ignores a card of another status in a page for this column", () => {
    const state = fromSnapshot([], totals({ PENDING: 1 }));
    expect(Object.keys(mergePage(state, "PENDING", [card("x", "READY", 1)]).orders)).toEqual([]);
  });
});

describe("optimistic moves", () => {
  it("shows the card in its new column and moves the badge counts, without touching the state", () => {
    const state = fromSnapshot([card("a", "PENDING", 1), card("b", "PENDING", 2)], totals({ PENDING: 2 }));
    const view = viewOf(state, { a: "PREPARING" });
    expect(view.columns.PENDING.map((c) => c.id)).toEqual(["b"]);
    expect(view.columns.PREPARING.map((c) => c.id)).toEqual(["a"]);
    expect(view.columns.PREPARING[0].status).toBe("PREPARING");
    expect(view.totals).toEqual(totals({ PENDING: 1, PREPARING: 1 }));
    expect(state.orders.a.status).toBe("PENDING");
  });

  it("is the same view as the state when there are no moves, or a move to where the card already is", () => {
    const state = fromSnapshot([card("a", "PENDING", 1)], totals({ PENDING: 1 }));
    expect(viewOf(state, {})).toEqual(viewOf(state, { a: "PENDING" }));
    expect(viewOf(state, { unknown: "READY" }).totals).toEqual(totals({ PENDING: 1 }));
  });

  it("reverts by simply dropping the move", () => {
    const state = fromSnapshot([card("a", "PENDING", 1)], totals({ PENDING: 1 }));
    expect(viewOf(state, {}).columns.PENDING.map((c) => c.id)).toEqual(["a"]);
  });
});

describe("a fresh snapshot", () => {
  it("keeps the delivered cards already loaded, since the server does not send them", () => {
    const opened = mergePage(fromSnapshot([], totals({ DELIVERED: 1 })), "DELIVERED", [card("d", "DELIVERED", 1)], totals({ DELIVERED: 1 }));
    const fresh = fromSnapshot([card("a", "PENDING", 2)], totals({ PENDING: 1, DELIVERED: 2 }));

    const merged = carryDelivered(fresh, opened);

    expect(Object.keys(merged.orders).sort()).toEqual(["a", "d"]);
    expect(merged.deliveredLoaded).toBe(true);
    expect(merged.totals.DELIVERED).toBe(2); // the server's count, not the old one
  });

  it("changes nothing when the delivered column was never opened", () => {
    const fresh = fromSnapshot([card("a", "PENDING", 2)], totals({ PENDING: 1 }));
    expect(carryDelivered(fresh, fromSnapshot([], totals()))).toBe(fresh);
  });
});
