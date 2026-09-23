import { describe, it, expect } from "vitest";
import { decodeBoardCursor, encodeBoardCursor } from "./board-cursor";

describe("board cursor", () => {
  const cursor = { placedAt: "2026-09-19T18:42:03.123Z", id: "cmu7v5g5s000bsguujagvbiio" };

  it("round-trips", () => {
    expect(decodeBoardCursor(encodeBoardCursor(cursor))).toEqual(cursor);
  });

  it("treats a missing cursor as the first page", () => {
    expect(decodeBoardCursor(undefined)).toBeNull();
    expect(decodeBoardCursor(null)).toBeNull();
    expect(decodeBoardCursor("")).toBeNull();
  });

  it("rejects anything that is not exactly what it produces, instead of guessing", () => {
    for (const bad of [
      "garbage",
      "2026-09-19T18:42:03.123Z",
      "2026-09-19T18:42:03.123Z|",
      "|abc",
      "not-a-date|abc",
      "2026-09-19|abc",
      "2026-09-19T18:42:03Z|abc",
      "2026-09-19T18:42:03.123Z|a b",
      "2026-09-19T18:42:03.123Z|abc|extra",
      `2026-09-19T18:42:03.123Z|${"x".repeat(65)}`,
    ]) {
      expect(decodeBoardCursor(bad), bad).toBeNull();
    }
  });
});
