import type { ReportRangeKey, CalendarDate } from "@/lib/reports/date-range";

const VALID_KEYS: ReportRangeKey[] = ["today", "yesterday", "7d", "month", "custom"];

function isValidKey(value: string | undefined): value is ReportRangeKey {
  return value !== undefined && (VALID_KEYS as string[]).includes(value);
}

/**
 * Parses AND validates — a shape match alone (`\d{4}-\d{2}-\d{2}`) would
 * accept "2026-02-30" or "2026-13-01", which Date.UTC then silently
 * normalizes into a different calendar date instead of rejecting. Rebuilding
 * the date and checking every field round-trips exactly is what catches that
 * instead of quietly querying the wrong days.
 */
function parseCalendarDate(value: string | undefined): CalendarDate | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const asDate = new Date(Date.UTC(year, month - 1, day));
  const roundTrips =
    asDate.getUTCFullYear() === year && asDate.getUTCMonth() === month - 1 && asDate.getUTCDate() === day;
  return roundTrips ? { year, month, day } : null;
}

function isBeforeOrEqual(a: CalendarDate, b: CalendarDate): boolean {
  return Date.UTC(a.year, a.month - 1, a.day) <= Date.UTC(b.year, b.month - 1, b.day);
}

export type ParsedRangeParams = {
  key: ReportRangeKey;
  custom?: { from: CalendarDate; to: CalendarDate };
};

/**
 * `key: "custom"` with no `custom` field means "the user is on the custom
 * tab but hasn't picked dates yet" — deliberately NOT downgraded to another
 * key here, or clicking "Rango…" with no dates filled in yet would silently
 * jump back to "Hoy" and hide the date form that was supposed to appear.
 * Callers that need an actual range to query (the page, the CSV export
 * route) fall back to "today" themselves via resolvableRangeKey below.
 */
export function parseRangeParams(params: { range?: string; from?: string; to?: string }): ParsedRangeParams {
  const key = isValidKey(params.range) ? params.range : "today";
  if (key !== "custom") return { key };

  const from = parseCalendarDate(params.from);
  const to = parseCalendarDate(params.to);
  // A reversed range (from > to) would resolve to an empty, backwards
  // instant window and silently render an all-zero report — treated the
  // same as "no dates yet" so the form comes back instead of a fake $0 day.
  if (from && to && isBeforeOrEqual(from, to)) return { key, custom: { from, to } };
  return { key: "custom" };
}

/** The range key to actually resolve and query — "custom" with no valid dates chosen yet falls back to "today" so there's always something to show. */
export function resolvableRangeKey(parsed: ParsedRangeParams): ReportRangeKey {
  return parsed.key === "custom" && !parsed.custom ? "today" : parsed.key;
}
