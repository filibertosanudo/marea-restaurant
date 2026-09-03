/**
 * Pure time-window math for the weekly schedule editor — no Date, no
 * timezone, just integers, per the module's own rule that a weekly
 * schedule is minutes-since-midnight, never a Date. The client uses these
 * for live feedback as the admin types; the server re-runs the exact same
 * functions as the authoritative check, since it never trusts a client's
 * own arithmetic for something this stateful.
 */

export type TimeBlockInput = { opensAt: string; closesAt: string };
export type NormalizedBlock = { opensAt: number; closesAt: number };

/** "18:30" -> 1110. Returns null for anything that isn't a valid 24h HH:mm. */
export function parseTimeToMinutes(hhmm: string): number | null {
  const match = /^([0-1]\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** 1110 -> "18:30". Wraps past 1440 back into a 24h clock, for labeling an after-midnight closesAt. */
export function formatMinutesToTime(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * A close time at or before the open time is read as "past midnight"
 * (closesAt > 1440), matching the OpeningHour column's own documented
 * convention, rather than being rejected as invalid — that's the one
 * schedule shape (a bar open 20:00-02:00) the flat "closesAt > opensAt"
 * rule would otherwise wrongly block. Returns null only when the two
 * times are identical (a zero-length block, never valid either way).
 */
export function normalizeBlock(block: TimeBlockInput): NormalizedBlock | null {
  const opensAt = parseTimeToMinutes(block.opensAt);
  const closesAt = parseTimeToMinutes(block.closesAt);
  if (opensAt === null || closesAt === null) return null;
  if (opensAt === closesAt) return null;
  return { opensAt, closesAt: closesAt > opensAt ? closesAt : closesAt + 1440 };
}

function blocksOverlap(a: NormalizedBlock, b: NormalizedBlock): boolean {
  return a.opensAt < b.closesAt && b.opensAt < a.closesAt;
}

export type DayScheduleInput = { dayOfWeek: number; isOpen: boolean; blocks: TimeBlockInput[] };
export type DayScheduleError = { dayOfWeek: number; message: "invalid_time" | "empty_block" | "overlap" };

/**
 * Per-day validation, plus one cross-day check: an after-midnight block's
 * spillover (the part past 1440) lands on the *next* day's own clock, so a
 * Saturday 20:00-02:00 block and a separately-configured Sunday 00:00-06:00
 * block genuinely overlap even though neither day's blocks overlap with
 * themselves. Returns one error per offending day (first problem found),
 * since the editor surfaces one message per row.
 */
export function validateWeeklySchedule(days: DayScheduleInput[]): DayScheduleError[] {
  const errors: DayScheduleError[] = [];
  const errorDays = new Set<number>();
  const normalizedByDay = new Map<number, NormalizedBlock[]>();

  for (const day of days) {
    if (!day.isOpen) continue;
    if (day.blocks.length === 0) {
      errors.push({ dayOfWeek: day.dayOfWeek, message: "empty_block" });
      errorDays.add(day.dayOfWeek);
      continue;
    }

    const normalized: NormalizedBlock[] = [];
    let bad = false;
    for (const block of day.blocks) {
      const n = normalizeBlock(block);
      if (!n) {
        bad = true;
        break;
      }
      normalized.push(n);
    }
    if (bad) {
      errors.push({ dayOfWeek: day.dayOfWeek, message: "invalid_time" });
      errorDays.add(day.dayOfWeek);
      continue;
    }

    const hasOverlap = normalized.some((a, i) => normalized.some((b, j) => i < j && blocksOverlap(a, b)));
    if (hasOverlap) {
      errors.push({ dayOfWeek: day.dayOfWeek, message: "overlap" });
      errorDays.add(day.dayOfWeek);
      continue;
    }

    normalizedByDay.set(day.dayOfWeek, normalized);
  }

  for (const [dayOfWeek, normalized] of normalizedByDay) {
    const nextDay = (dayOfWeek + 1) % 7;
    const nextBlocks = normalizedByDay.get(nextDay);
    if (!nextBlocks || errorDays.has(nextDay)) continue;

    const spillovers = normalized
      .filter((b) => b.closesAt > 1440)
      .map((b): NormalizedBlock => ({ opensAt: 0, closesAt: b.closesAt - 1440 }));
    const crossesOverlap = spillovers.some((s) => nextBlocks.some((n) => blocksOverlap(s, n)));
    if (crossesOverlap) {
      errors.push({ dayOfWeek: nextDay, message: "overlap" });
      errorDays.add(nextDay);
    }
  }

  return errors;
}
