import { describe, expect, it } from "vitest";
import type { OpeningHourWindow } from "@/lib/reservations/availability";
import { effectiveLevel, lastClosingAtOrBefore, levelByDate, nextLapsedSince, whenLevelStarts } from "./degrade";

// America/Mexico_City is UTC-6 all year (no daylight saving since 2022), so
// local 23:00 is 05:00Z the next day.
const TZ = "America/Mexico_City";
const everyDay = (opensAt: number, closesAt: number): OpeningHourWindow[] =>
  [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, opensAt, closesAt, isClosed: false }));
const LUNCH_TO_ELEVEN = everyDay(13 * 60, 23 * 60);
const z = (iso: string) => new Date(iso);

// Stopped paying at 06:00 local on 1 November: day 7 is 06:00 local on 8 November.
const LAPSED = z("2026-11-01T12:00:00Z");

describe("nextLapsedSince", () => {
  const now = z("2026-11-05T00:00:00Z");

  it("starts the clock at the first non-paying status and keeps it while unpaid", () => {
    expect(nextLapsedSince("PAST_DUE", null, now)).toEqual(now);
    expect(nextLapsedSince("UNPAID", LAPSED, now)).toEqual(LAPSED);
    for (const status of ["PAUSED", "CANCELED", "INCOMPLETE_EXPIRED"] as const) expect(nextLapsedSince(status, null, now)).toEqual(now);
  });

  it("clears it once the subscription pays or is in its trial", () => {
    expect(nextLapsedSince("ACTIVE", LAPSED, now)).toBeNull();
    expect(nextLapsedSince("TRIALING", LAPSED, now)).toBeNull();
  });
});

describe("levelByDate", () => {
  it("warns at once, freezes the panel from day 7 and suspends from day 15", () => {
    expect(levelByDate(null, z("2026-12-31T00:00:00Z"))).toBe("NONE");
    expect(levelByDate(LAPSED, z("2026-11-08T11:59:00Z"))).toBe("WARNING");
    expect(levelByDate(LAPSED, z("2026-11-08T12:00:00Z"))).toBe("READ_ONLY");
    expect(levelByDate(LAPSED, z("2026-11-16T12:00:00Z"))).toBe("SUSPENDED");
  });
});

describe("lastClosingAtOrBefore", () => {
  it("is the last closing of the branch's own hours, in its time zone", () => {
    // 14:00 local on 8 November, open: the last closing was 23:00 local the night before.
    expect(lastClosingAtOrBefore(z("2026-11-08T20:00:00Z"), LUNCH_TO_ELEVEN, TZ)).toEqual(z("2026-11-08T05:00:00Z"));
  });

  it("puts a closing after midnight on the next calendar day", () => {
    const lateBar = everyDay(18 * 60, 26 * 60); // 18:00 to 02:00
    expect(lastClosingAtOrBefore(z("2026-11-08T07:30:00Z"), lateBar, TZ)).toEqual(z("2026-11-07T08:00:00Z"));
    expect(lastClosingAtOrBefore(z("2026-11-08T08:30:00Z"), lateBar, TZ)).toEqual(z("2026-11-08T08:00:00Z"));
  });

  it("falls back to 04:00 local for a branch with no hours", () => {
    expect(lastClosingAtOrBefore(z("2026-11-08T09:00:00Z"), [], TZ)).toEqual(z("2026-11-07T10:00:00Z"));
  });
});

describe("effectiveLevel", () => {
  it("does not freeze the panel during the service in which day 7 arrives", () => {
    // 14:00 local on 8 November: past day 7 by the calendar, but the last
    // closing was before it, so lunch runs as usual.
    expect(effectiveLevel(LAPSED, z("2026-11-08T20:00:00Z"), LUNCH_TO_ELEVEN, TZ)).toBe("WARNING");
    // 23:30 local, after that night's close.
    expect(effectiveLevel(LAPSED, z("2026-11-09T05:30:00Z"), LUNCH_TO_ELEVEN, TZ)).toBe("READ_ONLY");
  });

  it("suspends only after the closing that follows day 15", () => {
    expect(effectiveLevel(LAPSED, z("2026-11-16T20:00:00Z"), LUNCH_TO_ELEVEN, TZ)).toBe("READ_ONLY");
    expect(effectiveLevel(LAPSED, z("2026-11-17T05:30:00Z"), LUNCH_TO_ELEVEN, TZ)).toBe("SUSPENDED");
  });

  it("warns from the first moment, and lifts the moment the payment clears", () => {
    expect(effectiveLevel(LAPSED, z("2026-11-01T12:00:01Z"), LUNCH_TO_ELEVEN, TZ)).toBe("WARNING");
    expect(effectiveLevel(null, z("2026-11-20T20:00:00Z"), LUNCH_TO_ELEVEN, TZ)).toBe("NONE");
  });
});

describe("whenLevelStarts", () => {
  it("is the first closing at or after the date, lunch included", () => {
    const twoServices: OpeningHourWindow[] = [
      ...everyDay(13 * 60, 16 * 60),
      ...everyDay(19 * 60, 23 * 60),
    ];
    // Day 7 is 06:00 local on 8 November; the next closing is the end of lunch.
    expect(whenLevelStarts("READ_ONLY", LAPSED, twoServices, TZ)).toEqual(z("2026-11-08T22:00:00Z"));
    expect(whenLevelStarts("READ_ONLY", LAPSED, LUNCH_TO_ELEVEN, TZ)).toEqual(z("2026-11-09T05:00:00Z"));
  });

  it("skips a day the branch does not open", () => {
    // 8 November 2026 is a Sunday; closed on Sundays, the next closing is Monday's.
    const closedSunday = LUNCH_TO_ELEVEN.map((h) => (h.dayOfWeek === 0 ? { ...h, isClosed: true } : h));
    expect(whenLevelStarts("READ_ONLY", LAPSED, closedSunday, TZ)).toEqual(z("2026-11-10T05:00:00Z"));
  });
});
