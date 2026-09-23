import { describe, it, expect } from "vitest";
import { boardCardsUrl, boardPageUrl } from "./board-api";

describe("board api urls", () => {
  it("names the orders and carries the board's filters", () => {
    expect(boardCardsUrl(["a", "b"], {})).toBe("/api/orders/board?ids=a%2Cb");
    expect(boardCardsUrl(["a"], { type: "TAKEAWAY", table: "t1" })).toBe("/api/orders/board?ids=a&type=TAKEAWAY&table=t1");
  });

  it("asks for a column's first page, then the page after a cursor, encoded", () => {
    expect(boardPageUrl("PENDING", null, {})).toBe("/api/orders/board?status=PENDING");
    expect(boardPageUrl("READY", "2026-09-19T18:42:03.123Z|abc", { table: "t1" })).toBe(
      "/api/orders/board?status=READY&after=2026-09-19T18%3A42%3A03.123Z%7Cabc&table=t1"
    );
  });

  it("leaves out an empty filter", () => {
    expect(boardPageUrl("PENDING", null, { type: null, table: "" })).toBe("/api/orders/board?status=PENDING");
  });
});
