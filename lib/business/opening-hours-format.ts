import type { Lang } from "@/lib/i18n/lang";
import type { OpeningHourWindow } from "@/lib/reservations/availability";

/**
 * Turns the seven-days-times-two-blocks table `OpeningHourWindow[]` into
 * the strings the landing needs: the footer's human line ("Tue–Sun · 12pm –
 * 11pm") and, separately, the schema.org `openingHours` values Google's
 * structured-data reads ("Tu,We,Th 12:00-23:00"). Pure: no Prisma, no clock
 * — same discipline as lib/settings/schedule.ts, since this is presentation
 * logic that has to be unit-testable against fixed rows, not whatever the
 * business happens to have configured today.
 *
 * Both formats share the one place that decides which days are open with
 * which blocks (groupConsecutiveDays, working off buildDayKeys) — only how a
 * group gets rendered into text differs between the two formats.
 */

const DAY_NAMES: Record<Lang, string[]> = {
  // Index matches OpeningHour.dayOfWeek: 0 = Sunday … 6 = Saturday.
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  es: ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"],
};

// schema.org's own two-letter day codes (https://schema.org/openingHours) —
// always English, never localized, unlike DAY_NAMES above.
const SCHEMA_DAY_CODES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** 750 -> "12:30pm". Wraps a past-midnight closesAt (e.g. 1500) back onto the 12-hour clock the same way lib/settings/schedule.ts's formatMinutesToTime wraps onto 24h. */
function formatClockTime12h(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  const period = h24 < 12 ? "am" : "pm";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
}

/** 750 -> "12:30". Same wrap, 24h clock, for schema.org's HH:MM. */
function formatClockTime24h(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

type DayBlocks = { dayOfWeek: number; blocks: { opensAt: number; closesAt: number }[] } | null;

/** Per day 0..6: null if closed (or never configured), else that day's blocks sorted by opensAt. The one place both formats read "what does this business look like on paper." */
function buildDayBlocks(hours: OpeningHourWindow[]): DayBlocks[] {
  const byDay = new Map<number, OpeningHourWindow[]>();
  for (const row of hours) {
    if (!byDay.has(row.dayOfWeek)) byDay.set(row.dayOfWeek, []);
    byDay.get(row.dayOfWeek)!.push(row);
  }

  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const rows = byDay.get(dayOfWeek);
    if (!rows || rows.length === 0) return null;
    const blocks = rows
      .filter((r) => !r.isClosed)
      .sort((a, b) => a.opensAt - b.opensAt)
      .map((r) => ({ opensAt: r.opensAt, closesAt: r.closesAt }));
    return blocks.length > 0 ? { dayOfWeek, blocks } : null;
  });
}

/** A string that's equal for two days only when their blocks are exactly the same — the grouping key both formats key their "same schedule as yesterday" runs on. */
function blockKey(day: DayBlocks): string | null {
  if (day === null) return null;
  return day.blocks.map((b) => `${b.opensAt}-${b.closesAt}`).join("|");
}

/**
 * Groups the week into runs of consecutive days (by dayOfWeek, wrapping
 * Saturday into Sunday) sharing the same key, rotating the start of the week
 * so no run gets split across the array's own 6->0 boundary — a Fri/Sat/Sun
 * run sharing one key must read as one group, not "Fri–Sat" plus a separate
 * "Sun" just because the underlying array happens to end at Saturday.
 */
function groupConsecutiveDays<T>(perDay: (T | null)[]): { days: number[]; value: T }[] {
  let startIndex = 0;
  const closedIndex = perDay.findIndex((v) => v === null);
  if (closedIndex !== -1) {
    startIndex = (closedIndex + 1) % 7;
  } else {
    const changeIndex = perDay.findIndex((v, i) => v !== perDay[(i + 6) % 7]);
    if (changeIndex > 0) startIndex = changeIndex;
  }
  const rotated = Array.from({ length: 7 }, (_, i) => {
    const dayOfWeek = (startIndex + i) % 7;
    return { dayOfWeek, value: perDay[dayOfWeek] };
  });

  const groups: { days: number[]; value: T }[] = [];
  let i = 0;
  while (i < rotated.length) {
    const { value } = rotated[i];
    if (value === null) {
      i += 1;
      continue;
    }
    let j = i;
    while (j + 1 < rotated.length && rotated[j + 1].value === value) j += 1;
    groups.push({ days: rotated.slice(i, j + 1).map((r) => r.dayOfWeek), value });
    i = j + 1;
  }
  return groups;
}

/** The footer's human line, e.g. "Tue–Sun · 12pm – 11pm". Returns null when every day is closed — the caller hides the whole line rather than print an empty schedule. */
export function formatWeeklyHours(hours: OpeningHourWindow[], lang: Lang): string | null {
  const dayBlocks = buildDayBlocks(hours);
  if (dayBlocks.every((d) => d === null)) return null;

  const labels = dayBlocks.map((d) =>
    d === null ? null : d.blocks.map((b) => `${formatClockTime12h(b.opensAt)} – ${formatClockTime12h(b.closesAt)}`).join(", ")
  );
  const groups = groupConsecutiveDays(labels);

  const dayNames = DAY_NAMES[lang];
  return groups
    .map(({ days, value }) => {
      const dayRange =
        days.length === 1 ? dayNames[days[0]] : `${dayNames[days[0]]}–${dayNames[days[days.length - 1]]}`;
      return `${dayRange} · ${value}`;
    })
    .join("; ");
}

/** schema.org's `openingHours` values, e.g. ["Tu,We,Th 12:00-23:00"] — one entry per (day-group, block), since that property takes a single time range, not a comma list of them. Empty array when every day is closed. */
export function formatOpeningHoursSchemaOrg(hours: OpeningHourWindow[]): string[] {
  const dayBlocks = buildDayBlocks(hours);
  const groups = groupConsecutiveDays(dayBlocks.map(blockKey)).map((g) => ({
    days: g.days,
    blocks: dayBlocks[g.days[0]]!.blocks,
  }));

  return groups.flatMap(({ days, blocks }) => {
    const dayCodes = days.map((d) => SCHEMA_DAY_CODES[d]).join(",");
    return blocks.map((b) => `${dayCodes} ${formatClockTime24h(b.opensAt)}-${formatClockTime24h(b.closesAt)}`);
  });
}
