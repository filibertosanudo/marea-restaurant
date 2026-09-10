import { describe, expect, it } from "vitest";
import { parseRangeParams, resolvableRangeKey } from "./range-params";

describe("parseRangeParams", () => {
  it("defaults to today for no range param", () => {
    expect(parseRangeParams({})).toEqual({ key: "today" });
  });

  it("falls back to today for an unknown range value", () => {
    expect(parseRangeParams({ range: "decade" })).toEqual({ key: "today" });
  });

  it("parses a valid custom range", () => {
    expect(parseRangeParams({ range: "custom", from: "2026-03-01", to: "2026-03-05" })).toEqual({
      key: "custom",
      custom: { from: { year: 2026, month: 3, day: 1 }, to: { year: 2026, month: 3, day: 5 } },
    });
  });

  it("keeps the key as 'custom' (not a silent fallback) when dates are missing, so the date form still renders", () => {
    expect(parseRangeParams({ range: "custom" })).toEqual({ key: "custom" });
  });

  it("keeps the key as 'custom' when a date is malformed", () => {
    expect(parseRangeParams({ range: "custom", from: "not-a-date", to: "2026-03-05" })).toEqual({ key: "custom" });
  });

  it("rejects a calendar date that doesn't exist, instead of silently rolling it into the next month", () => {
    expect(parseRangeParams({ range: "custom", from: "2026-02-30", to: "2026-03-05" })).toEqual({ key: "custom" });
  });

  it("rejects an out-of-range month", () => {
    expect(parseRangeParams({ range: "custom", from: "2026-13-01", to: "2026-13-05" })).toEqual({ key: "custom" });
  });

  it("rejects a reversed range (from after to) instead of resolving to a backwards, empty window", () => {
    expect(parseRangeParams({ range: "custom", from: "2026-03-10", to: "2026-03-01" })).toEqual({ key: "custom" });
  });

  it("accepts a single-day custom range (from equals to)", () => {
    const result = parseRangeParams({ range: "custom", from: "2026-03-05", to: "2026-03-05" });
    expect(result.custom).toEqual({ from: { year: 2026, month: 3, day: 5 }, to: { year: 2026, month: 3, day: 5 } });
  });
});

describe("resolvableRangeKey", () => {
  it("passes through a normal key unchanged", () => {
    expect(resolvableRangeKey({ key: "7d" })).toBe("7d");
  });

  it("falls back to today for custom with no dates yet", () => {
    expect(resolvableRangeKey({ key: "custom" })).toBe("today");
  });

  it("keeps custom once dates are chosen", () => {
    expect(
      resolvableRangeKey({ key: "custom", custom: { from: { year: 2026, month: 3, day: 1 }, to: { year: 2026, month: 3, day: 5 } } })
    ).toBe("custom");
  });
});
