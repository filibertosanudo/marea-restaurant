import { SubscriptionStatus } from "@/lib/generated/prisma/client";
import {
  businessLocalDateParts,
  localWallClockToUtc,
  type OpeningHourWindow,
} from "@/lib/reservations/availability";

/**
 * The degrade ladder (module 19, phase 8), as the owner approved it: what
 * stops working first is what the owner uses, never what the guests use.
 *
 *   WARNING    not paying: Stripe retries, the panel warns, everything works.
 *   READ_ONLY  from day 7: the panel's configuration is frozen; orders,
 *              kitchen, cash, payments, reservations and sold-out keep working.
 *   SUSPENDED  from day 15: the public site pauses and the panel is read-only.
 *
 * Paying works on every step, and a payment lifts all of them at once (the
 * webhook clears lapsedSince). Nothing here is stored: the step is computed
 * from lapsedSince and the clock every time it is asked for, so it cannot get
 * stuck, and there is no job to forget to run.
 *
 * Never during service: a step only ever moves forward at a closing time of
 * the branch, from its own opening hours in its own time zone (04:00 local
 * when it has none). A date that passes at lunch takes effect after close.
 */

export type DegradeLevel = "NONE" | "WARNING" | "READ_ONLY" | "SUSPENDED";

export const READ_ONLY_AFTER_DAYS = 7;
export const SUSPEND_AFTER_DAYS = 15;

const DAY_MS = 24 * 60 * 60 * 1000;
const FALLBACK_CLOSING_MINUTES = 4 * 60;
const RANK: Record<DegradeLevel, number> = { NONE: 0, WARNING: 1, READ_ONLY: 2, SUSPENDED: 3 };

/** Every status Stripe uses for a subscription nobody is paying: each one starts the clock. */
export const NON_PAYING: ReadonlySet<SubscriptionStatus> = new Set([
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.UNPAID,
  SubscriptionStatus.PAUSED,
  SubscriptionStatus.CANCELED,
  SubscriptionStatus.INCOMPLETE_EXPIRED,
]);

/** The new lapsedSince for a subscription now in `status`: kept while it stays unpaid, started at `now`, cleared once it pays. */
export function nextLapsedSince(status: SubscriptionStatus, current: Date | null, now: Date): Date | null {
  if (!NON_PAYING.has(status)) return null;
  return current ?? now;
}

/** The step the calendar alone says, at instant `at`. */
export function levelByDate(lapsedSince: Date | null, at: Date): DegradeLevel {
  if (!lapsedSince) return "NONE";
  const days = (at.getTime() - lapsedSince.getTime()) / DAY_MS;
  if (days >= SUSPEND_AFTER_DAYS) return "SUSPENDED";
  if (days >= READ_ONLY_AFTER_DAYS) return "READ_ONLY";
  return "WARNING";
}

/**
 * Every closing instant of the branch on the local calendar days from `back`
 * days before `around` to `ahead` days after it. A window may close after
 * midnight (closesAt above 1440), which lands on the next calendar day.
 */
function closingsAround(around: Date, back: number, ahead: number, hours: OpeningHourWindow[], timeZone: string): Date[] {
  const open = hours.filter((h) => !h.isClosed);
  const base = businessLocalDateParts(around, timeZone);
  const instants: Date[] = [];
  for (let offset = -back; offset <= ahead; offset++) {
    const day = new Date(Date.UTC(base.year, base.month - 1, base.day + offset));
    const minutesList = open.length ? open.filter((h) => h.dayOfWeek === day.getUTCDay()).map((h) => h.closesAt) : [FALLBACK_CLOSING_MINUTES];
    for (const minutes of minutesList) {
      instants.push(localWallClockToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), minutes, timeZone));
    }
  }
  return instants;
}

/** The latest moment at or before `now` when the branch closed, looking back far enough to cross a week with closed days. */
export function lastClosingAtOrBefore(now: Date, hours: OpeningHourWindow[], timeZone: string): Date {
  const past = closingsAround(now, 8, 0, hours, timeZone).filter((instant) => instant <= now);
  // Empty only for hours that never close in eight days, which the editor
  // does not allow; holding a week back can never move a step in service.
  if (past.length === 0) return new Date(now.getTime() - 7 * DAY_MS);
  return past.reduce((a, b) => (b > a ? b : a));
}

/**
 * The step a branch is on right now. Warning starts the moment payment
 * stops (nothing breaks, so there is no reason to wait for closing); the
 * steps that take something away count only up to the last closing.
 */
export function effectiveLevel(lapsedSince: Date | null, now: Date, hours: OpeningHourWindow[], timeZone: string): DegradeLevel {
  if (!lapsedSince) return "NONE";
  const byLastClose = levelByDate(lapsedSince, lastClosingAtOrBefore(now, hours, timeZone));
  return RANK[byLastClose] > RANK.WARNING ? byLastClose : "WARNING";
}

/** The first instant a branch will be on `level`, for the panel to say when: the first closing at or after the calendar date. */
export function whenLevelStarts(level: "READ_ONLY" | "SUSPENDED", lapsedSince: Date, hours: OpeningHourWindow[], timeZone: string): Date {
  const due = new Date(lapsedSince.getTime() + (level === "READ_ONLY" ? READ_ONLY_AFTER_DAYS : SUSPEND_AFTER_DAYS) * DAY_MS);
  const next = closingsAround(due, 1, 8, hours, timeZone).filter((instant) => instant >= due);
  if (next.length === 0) return due;
  return next.reduce((a, b) => (b < a ? b : a));
}

export function atLeast(level: DegradeLevel, floor: DegradeLevel): boolean {
  return RANK[level] >= RANK[floor];
}
