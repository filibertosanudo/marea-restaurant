import { localWallClockToUtc, businessLocalDateParts } from "@/lib/reservations/availability";

/**
 * Every boundary here is a business-local CALENDAR date — never a raw
 * millisecond offset. A calendar day isn't always 86_400_000ms in a
 * timezone that observes DST, so "7 days back" has to mean 7 wall-clock
 * dates, resolved to UTC instants one at a time via localWallClockToUtc,
 * not `end.getTime() - 7 * 86_400_000`.
 */
export type CalendarDate = { year: number; month: number; day: number };

export type ReportRangeKey = "today" | "yesterday" | "7d" | "month" | "custom";

export type ResolvedReportRange = {
  /** [start, end) as real UTC instants, ready for a Prisma `gte`/`lt` filter. */
  start: Date;
  end: Date;
  /** The equivalent prior period this range is measured against — see the switch below for what "equivalent" means per range key. */
  comparisonStart: Date;
  comparisonEnd: Date;
  /** Trailing 7 calendar days ending on the range's own last day — always this width regardless of the selected range, so the "sales by day" chart never grows unbounded on `month`/`custom`. */
  chartStart: Date;
  chartEnd: Date;
};

/** Exported for lib/reports/aggregate.ts, which needs the same calendar-day stepping to enumerate every day a chart bucket covers. */
export function addDays(date: CalendarDate, delta: number): CalendarDate {
  // Date.UTC normalizes day overflow/underflow across month (and year)
  // boundaries on its own — day 32 of January becomes February 1st.
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + delta));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function daysInMonth(year: number, month: number): number {
  // Date.UTC(year, month, 0) — month here is the 0-indexed *next* month, so
  // day 0 of it is the last day of the target (1-indexed) `month`.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Calendar-day count between two dates, computed off naive UTC components — never a real elapsed-time measurement, so it's exempt from the "no raw ms day math" rule above (there's no timezone or DST involved in just counting calendar dates). */
function dayNumber(date: CalendarDate): number {
  return Math.round(Date.UTC(date.year, date.month - 1, date.day) / 86_400_000);
}

function midnight(date: CalendarDate, timezone: string): Date {
  return localWallClockToUtc(date.year, date.month, date.day, 0, timezone);
}

/** The block of the same day-count immediately before `start` — shared by every range key whose comparison period is just "the same span, one step back" (7d, custom), so a future change to that rule can't apply to one and silently miss the other. */
function precedingBlockOfSameLength(start: CalendarDate, end: CalendarDate): [CalendarDate, CalendarDate] {
  const dayCount = dayNumber(end) - dayNumber(start) + 1;
  const comparisonEnd = addDays(start, -1);
  const comparisonStart = addDays(comparisonEnd, -(dayCount - 1));
  return [comparisonStart, comparisonEnd];
}

/**
 * Resolves one of the report's range presets to real UTC instants in the
 * business's own timezone, plus the period it's compared against — NOT
 * always "the immediately preceding block of the same length": see each
 * case below for why its own comparison period is picked the way it is.
 */
export function resolveReportRange(
  key: ReportRangeKey,
  timezone: string,
  now: Date,
  custom?: { from: CalendarDate; to: CalendarDate }
): ResolvedReportRange {
  const today = businessLocalDateParts(now, timezone);

  let start: CalendarDate;
  let end: CalendarDate; // inclusive
  let comparisonStart: CalendarDate;
  let comparisonEnd: CalendarDate; // inclusive

  switch (key) {
    // Same weekday one week back, not the calendar day right before it — a
    // restaurant's volume swings hard by day of week, so "today vs
    // yesterday" is a false signal where "today vs last [same weekday]" is
    // the fair baseline.
    case "today":
    case "yesterday": {
      const target = key === "today" ? today : addDays(today, -1);
      start = target;
      end = target;
      comparisonStart = addDays(target, -7);
      comparisonEnd = comparisonStart;
      break;
    }
    // Immediately preceding block of the same length — the fair comparison
    // once the window is already a full week or an arbitrary range, with
    // no single weekday left over- or under-represented.
    case "7d": {
      start = addDays(today, -6);
      end = today;
      [comparisonStart, comparisonEnd] = precedingBlockOfSameLength(start, end);
      break;
    }
    // Same number of days ELAPSED in the previous month, not the whole
    // previous month — on the 3rd of the month, "so far" vs "all 31 days
    // of last month" always reads as a crash regardless of how it's going.
    case "month": {
      start = { year: today.year, month: today.month, day: 1 };
      end = today;
      const prevMonth = today.month === 1 ? 12 : today.month - 1;
      const prevYear = today.month === 1 ? today.year - 1 : today.year;
      const elapsedDays = Math.min(today.day, daysInMonth(prevYear, prevMonth));
      comparisonStart = { year: prevYear, month: prevMonth, day: 1 };
      comparisonEnd = { year: prevYear, month: prevMonth, day: elapsedDays };
      break;
    }
    case "custom": {
      if (!custom) throw new Error("resolveReportRange: custom range requires from/to");
      start = custom.from;
      end = custom.to;
      [comparisonStart, comparisonEnd] = precedingBlockOfSameLength(start, end);
      break;
    }
  }

  const endExclusive = midnight(addDays(end, 1), timezone);
  return {
    start: midnight(start, timezone),
    end: endExclusive,
    comparisonStart: midnight(comparisonStart, timezone),
    comparisonEnd: midnight(addDays(comparisonEnd, 1), timezone),
    chartStart: midnight(addDays(end, -6), timezone),
    chartEnd: endExclusive,
  };
}
