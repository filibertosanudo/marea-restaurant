import type { ReservationStatus } from "@/lib/generated/prisma/client";

/**
 * The one function this module builds around: given a business's schedule,
 * its tables, and everything already on the books, which exact slots (each
 * one already paired with a specific free table) can a guest actually book.
 * Pure and framework-free on purpose — no Prisma import, no "server-only",
 * no Date.now() inside — so it can be unit-tested without a database and
 * so the Server Action that calls it (Fase 4) is the only place a client
 * or a clock can influence the result.
 *
 * Every date in and out of this module is either a plain {year, month, day}
 * business-local calendar date, or a real UTC instant (Date) already
 * resolved against the business's own timezone — never a string a
 * component parsed with `new Date()`. That resolution happens once, here,
 * via localWallClockToUtc; nothing downstream re-derives it.
 */

export type OpeningHourWindow = {
  /** 0 = domingo … 6 = sábado, matching Date.getDay() and OpeningHour.dayOfWeek. */
  dayOfWeek: number;
  /** Minutes since local midnight. */
  opensAt: number;
  /** Minutes since local midnight — can exceed 1440 for a close after midnight (a bar open past 12am). */
  closesAt: number;
  isClosed: boolean;
};

export type ClosureWindow = {
  /** Real UTC instants, not local wall-clock minutes — a closure is "this exact moment to that one", not a recurring daily window. */
  startsAt: Date;
  endsAt: Date;
};

export type ReservableTable = {
  id: string;
  seats: number;
};

export type ExistingReservation = {
  tableId: string | null;
  reservedFor: Date;
  endsAt: Date;
  status: ReservationStatus;
};

/** The only statuses that actually hold a table against new bookings — a CANCELLED or NO_SHOW reservation left the calendar. */
const BLOCKING_STATUSES: ReservationStatus[] = ["PENDING", "CONFIRMED", "SEATED"];

export type AvailabilityInput = {
  /** The calendar day being checked, in the business's own local time. */
  date: { year: number; month: number; day: number };
  partySize: number;
  durationMinutes: number;
  maxPartySize: number;
  /** IANA zone, e.g. "America/Hermosillo". */
  timezone: string;
  openingHours: OpeningHourWindow[];
  closures: ClosureWindow[];
  tables: ReservableTable[];
  existingReservations: ExistingReservation[];
  /** Injected rather than read from the clock inside — the "must be in the future" rule needs a fixed instant to stay pure. */
  now: Date;
  /** Minutes between candidate slot starts. Defaults to 30, matching the granularity the landing's old hardcoded TIME_SLOTS used. */
  stepMinutes?: number;
  /** How far past `now` a slot must start to be bookable — a business rule (MIN_BOOKING_LEAD_MINUTES), not something this pure module decides on its own. Defaults to 0 (bare "must be in the future") so existing callers/tests that don't care about lead time are unaffected. */
  minLeadMinutes?: number;
};

export type AvailableSlot = {
  /** "HH:mm", 24h, business-local — the value a guest picks and the value the create action re-validates against, not a display label. */
  time: string;
  /** The exact UTC instant this slot starts — ready to store as Reservation.reservedFor. */
  startsAt: Date;
  /** The specific table this slot would seat the party at, already chosen (smallest table that fits) — see the module comment on why a table is picked this early instead of at confirm. */
  tableId: string;
};

/**
 * The UTC offset (in minutes, UTC−local) a timezone has at a given instant.
 * Resolved via Intl rather than a date library: Intl.DateTimeFormat already
 * carries the IANA database, including every DST rule, and the project has
 * no other reason to add a date-time dependency for this one conversion.
 */
function getTimeZoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return (asUtc - instant.getTime()) / 60_000;
}

/**
 * Resolves a business-local wall-clock moment to the real UTC instant it
 * represents. `minutesFromMidnight` can be >= 1440 — Date.UTC rolls hours
 * past 23 into the following day on its own, which is exactly the "closes
 * after midnight" case this module has to get right.
 *
 * The offset is computed at a first guess of the instant (treating the
 * local wall clock as if it were UTC) rather than at "now" — a closure or
 * an opening hour six months out must resolve against the offset that
 * actually applies on that date, not today's, since a timezone's UTC
 * offset changes across a DST transition.
 */
/**
 * Exported (unlike this module's other internals) because the Server Action
 * layer needs the exact same conversion to compute a UTC fetch window for
 * the day being checked — reservations and closures both live as UTC
 * instants in Postgres, and re-deriving this math a second way there would
 * be exactly the "disponibilidad calculada dos veces" this module rules out.
 */
export function localWallClockToUtc(
  year: number,
  month: number,
  day: number,
  minutesFromMidnight: number,
  timeZone: string
): Date {
  const hour = Math.floor(minutesFromMidnight / 60);
  const minute = minutesFromMidnight % 60;
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offsetMinutes = getTimeZoneOffsetMinutes(new Date(guessUtcMs), timeZone);
  return new Date(guessUtcMs - offsetMinutes * 60_000);
}

function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function isInsideClosure(startsAt: Date, endsAt: Date, closures: ClosureWindow[]): boolean {
  return closures.some((c) => rangesOverlap(startsAt, endsAt, c.startsAt, c.endsAt));
}

/**
 * The smallest table that fits the party and is free for the whole
 * [startsAt, endsAt) range — smallest first, not just "first free", so a
 * party of 2 doesn't quietly claim the only table for 8 and strand a
 * bigger party later the same evening.
 */
function findFreeTable(
  startsAt: Date,
  endsAt: Date,
  partySize: number,
  tables: ReservableTable[],
  existingReservations: ExistingReservation[]
): string | null {
  const candidates = tables.filter((t) => t.seats >= partySize).sort((a, b) => a.seats - b.seats);

  for (const table of candidates) {
    const isTaken = existingReservations.some(
      (r) =>
        r.tableId === table.id &&
        BLOCKING_STATUSES.includes(r.status) &&
        rangesOverlap(startsAt, endsAt, r.reservedFor, r.endsAt)
    );
    if (!isTaken) return table.id;
  }
  return null;
}

function minutesToHHMM(minutesFromMidnight: number): string {
  const normalized = ((minutesFromMidnight % 1440) + 1440) % 1440;
  const hh = Math.floor(normalized / 60);
  const mm = normalized % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Every slot a guest could book for one calendar day, each already paired
 * with the specific table it would seat them at. A slot only appears if,
 * simultaneously: it falls inside one of the day's OpeningHour windows
 * (fully — a party can't be seated past closing), it doesn't touch a
 * BusinessClosure, the party fits within Business.maxPartySize, a table
 * with enough seats is free for the whole range, and it starts in the
 * future relative to `now`.
 */
export function getAvailableSlots(input: AvailabilityInput): AvailableSlot[] {
  if (input.partySize < 1 || input.partySize > input.maxPartySize) return [];

  const step = input.stepMinutes ?? 30;
  const earliestBookable = new Date(input.now.getTime() + (input.minLeadMinutes ?? 0) * 60_000);
  const dayOfWeek = new Date(Date.UTC(input.date.year, input.date.month - 1, input.date.day)).getUTCDay();
  const windows = input.openingHours.filter((h) => h.dayOfWeek === dayOfWeek && !h.isClosed);

  const slots: AvailableSlot[] = [];

  for (const window of windows) {
    for (let minute = window.opensAt; minute + input.durationMinutes <= window.closesAt; minute += step) {
      const startsAt = localWallClockToUtc(input.date.year, input.date.month, input.date.day, minute, input.timezone);
      const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);

      if (startsAt <= earliestBookable) continue;
      if (isInsideClosure(startsAt, endsAt, input.closures)) continue;

      const tableId = findFreeTable(startsAt, endsAt, input.partySize, input.tables, input.existingReservations);
      if (!tableId) continue;

      slots.push({ time: minutesToHHMM(minute), startsAt, tableId });
    }
  }

  return slots;
}

/**
 * Re-validates one specific slot a guest picked, at the moment they submit —
 * by calling getAvailableSlots again, never a second, looser check. This is
 * what closes most of the race window between "the form loaded these
 * slots" and "the guest clicked submit seconds or minutes later"; the
 * EXCLUDE constraint is what closes the rest of it (see the migration for
 * reservation_no_overlap), for the sliver of time between this check and
 * the INSERT itself.
 */
export function findSlot(input: AvailabilityInput, requestedTime: string): AvailableSlot | null {
  return getAvailableSlots(input).find((slot) => slot.time === requestedTime) ?? null;
}
