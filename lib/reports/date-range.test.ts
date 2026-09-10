import { describe, expect, it } from "vitest";
import { resolveReportRange } from "./date-range";

// America/Hermosillo is UTC-7 year-round (Sonora doesn't observe DST) — the
// same deterministic zone lib/reservations/availability.test.ts uses, so a
// wall-clock date's UTC instant is easy to check by hand.
const TIMEZONE = "America/Hermosillo";
// 2026-03-10 19:00 UTC = 2026-03-10 12:00 local (UTC-7).
const NOW = new Date("2026-03-10T19:00:00Z");

describe("resolveReportRange", () => {
  it("resolves 'today' to local midnight through local midnight the next day", () => {
    const range = resolveReportRange("today", TIMEZONE, NOW);
    expect(range.start.toISOString()).toBe("2026-03-10T07:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-03-11T07:00:00.000Z");
  });

  it("compares 'today' against the same weekday one week back, not yesterday", () => {
    const range = resolveReportRange("today", TIMEZONE, NOW);
    expect(range.comparisonStart.toISOString()).toBe("2026-03-03T07:00:00.000Z");
    expect(range.comparisonEnd.toISOString()).toBe("2026-03-04T07:00:00.000Z");
  });

  it("resolves 'yesterday' to the previous local calendar day", () => {
    const range = resolveReportRange("yesterday", TIMEZONE, NOW);
    expect(range.start.toISOString()).toBe("2026-03-09T07:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-03-10T07:00:00.000Z");
  });

  it("moves the day-cut instant when the business timezone changes", () => {
    const hermosillo = resolveReportRange("today", "America/Hermosillo", NOW); // UTC-7
    const mexicoCity = resolveReportRange("today", "America/Mexico_City", NOW); // UTC-6
    expect(hermosillo.start.toISOString()).not.toBe(mexicoCity.start.toISOString());
    expect(mexicoCity.start.toISOString()).toBe("2026-03-10T06:00:00.000Z");
  });

  it("spans the trailing 6 local days plus today for '7d'", () => {
    const range = resolveReportRange("7d", TIMEZONE, NOW);
    expect(range.start.toISOString()).toBe("2026-03-04T07:00:00.000Z"); // today - 6
    expect(range.end.toISOString()).toBe("2026-03-11T07:00:00.000Z");
  });

  it("compares '7d' against the preceding 7-day block", () => {
    const range = resolveReportRange("7d", TIMEZONE, NOW);
    expect(range.comparisonStart.toISOString()).toBe("2026-02-25T07:00:00.000Z");
    expect(range.comparisonEnd.toISOString()).toBe("2026-03-04T07:00:00.000Z");
  });

  it("spans month-to-date for 'month'", () => {
    const range = resolveReportRange("month", TIMEZONE, NOW);
    expect(range.start.toISOString()).toBe("2026-03-01T07:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-03-11T07:00:00.000Z");
  });

  it("compares 'month' against the same number of elapsed days last month", () => {
    // 2026-03-10 is the 10th day of March, so the comparison is Feb 1-10.
    const range = resolveReportRange("month", TIMEZONE, NOW);
    expect(range.comparisonStart.toISOString()).toBe("2026-02-01T07:00:00.000Z");
    expect(range.comparisonEnd.toISOString()).toBe("2026-02-11T07:00:00.000Z");
  });

  it("clamps the month comparison to the shorter previous month's length", () => {
    const marchThirtyFirst = new Date("2026-03-31T19:00:00Z"); // noon local, March 31
    const range = resolveReportRange("month", TIMEZONE, marchThirtyFirst);
    // February 2026 (non-leap) only has 28 days.
    expect(range.comparisonStart.toISOString()).toBe("2026-02-01T07:00:00.000Z");
    expect(range.comparisonEnd.toISOString()).toBe("2026-03-01T07:00:00.000Z"); // through Feb 28, exclusive
  });

  it("resolves a custom range and compares it to the immediately preceding equal-length block", () => {
    const range = resolveReportRange("custom", TIMEZONE, NOW, {
      from: { year: 2026, month: 3, day: 5 },
      to: { year: 2026, month: 3, day: 8 }, // 4 days: 5, 6, 7, 8
    });
    expect(range.start.toISOString()).toBe("2026-03-05T07:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-03-09T07:00:00.000Z");
    expect(range.comparisonStart.toISOString()).toBe("2026-03-01T07:00:00.000Z");
    expect(range.comparisonEnd.toISOString()).toBe("2026-03-05T07:00:00.000Z");
  });

  it("always sizes the chart window to a trailing 7 calendar days ending on the range's last day", () => {
    const month = resolveReportRange("month", TIMEZONE, NOW);
    expect(month.chartEnd.toISOString()).toBe(month.end.toISOString());
    expect(month.chartStart.toISOString()).toBe("2026-03-04T07:00:00.000Z"); // today (10th) - 6, 7 days inclusive

    const today = resolveReportRange("today", TIMEZONE, NOW);
    expect(today.chartEnd.toISOString()).toBe(today.end.toISOString());
    expect(today.chartStart.toISOString()).toBe("2026-03-04T07:00:00.000Z");
  });
});
