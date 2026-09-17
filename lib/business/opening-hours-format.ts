import type { Lang } from "@/lib/i18n/lang";
import type { OpeningHourWindow } from "@/lib/reservations/availability";

/**
 * Turns the seven-days-times-two-blocks table `OpeningHourWindow[]` into the
 * one line the landing's footer shows ("Tue–Sun · 12pm – 11pm"). Pure: no
 * Prisma, no clock — same discipline as lib/settings/schedule.ts, since this
 * is presentation logic that has to be unit-testable against fixed rows, not
 * whatever the business happens to have configured today.
 *
 * Returns null when every day is closed — the caller hides the whole line
 * rather than print an empty schedule.
 */

const DAY_NAMES: Record<Lang, string[]> = {
  // Index matches OpeningHour.dayOfWeek: 0 = Sunday … 6 = Saturday.
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  es: ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"],
};

/** 750 -> "12:30pm". Wraps a past-midnight closesAt (e.g. 1500) back onto the 12-hour clock the same way lib/settings/schedule.ts's formatMinutesToTime wraps onto 24h. */
function formatClockTime(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  const period = h24 < 12 ? "am" : "pm";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
}

function formatDayLabel(day: OpeningHourWindow): string | null {
  if (day.isClosed) return null;
  return `${formatClockTime(day.opensAt)} – ${formatClockTime(day.closesAt)}`;
}

/** One label per day, in dayOfWeek order (0..6) — multiple blocks on the same day join with ", ". Missing rows for a day (never configured) read the same as isClosed. */
function buildDayLabels(hours: OpeningHourWindow[]): (string | null)[] {
  const byDay = new Map<number, OpeningHourWindow[]>();
  for (const row of hours) {
    if (!byDay.has(row.dayOfWeek)) byDay.set(row.dayOfWeek, []);
    byDay.get(row.dayOfWeek)!.push(row);
  }

  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const blocks = byDay.get(dayOfWeek);
    if (!blocks || blocks.length === 0) return null;
    const labels = blocks
      .slice()
      .sort((a, b) => a.opensAt - b.opensAt)
      .map(formatDayLabel)
      .filter((l): l is string => l !== null);
    return labels.length > 0 ? labels.join(", ") : null;
  });
}

export function formatWeeklyHours(hours: OpeningHourWindow[], lang: Lang): string | null {
  const labels = buildDayLabels(hours);
  if (labels.every((l) => l === null)) return null;

  // Rotate so the array boundary falls on a day-to-day change (a closed day
  // if one exists) instead of splitting a run of identical hours across
  // index 6 -> 0 — a Fri/Sat/Sun-same-hours run must read as one range, not
  // as "Fri–Sat" plus a separate "Sun" because the week array happens to end
  // at Saturday.
  let startIndex = 0;
  const closedIndex = labels.findIndex((l) => l === null);
  if (closedIndex !== -1) {
    startIndex = (closedIndex + 1) % 7;
  } else {
    const changeIndex = labels.findIndex((l, i) => l !== labels[(i + 6) % 7]);
    if (changeIndex > 0) startIndex = changeIndex;
  }
  const rotated = Array.from({ length: 7 }, (_, i) => {
    const dayOfWeek = (startIndex + i) % 7;
    return { dayOfWeek, label: labels[dayOfWeek] };
  });

  const dayNames = DAY_NAMES[lang];
  const groups: string[] = [];
  let i = 0;
  while (i < rotated.length) {
    const { label } = rotated[i];
    if (label === null) {
      i += 1;
      continue;
    }
    let j = i;
    while (j + 1 < rotated.length && rotated[j + 1].label === label) j += 1;

    const startName = dayNames[rotated[i].dayOfWeek];
    const endName = dayNames[rotated[j].dayOfWeek];
    const dayRange = i === j ? startName : `${startName}–${endName}`;
    groups.push(`${dayRange} · ${label}`);
    i = j + 1;
  }

  return groups.join("; ");
}
