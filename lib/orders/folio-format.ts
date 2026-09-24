// Pure helpers, no server-only import: the board and kitchen cards are Client
// Components and need shortFolio too.

// Old folios are "A-" plus digits ("A-0042"); new ones carry the business's
// local date and a second hyphen ("A-260918-042"), so no new folio can ever
// equal an old one and Order's @@unique([businessId, orderNumber]) keeps
// protecting a single namespace.
const LEGACY_FOLIO = /^A-\d+$/;
const DAILY_FOLIO = /^A-\d{6}-(\d{3,})$/;

export function isLegacyFolio(value: string): boolean {
  return LEGACY_FOLIO.test(value);
}

export function isDailyFolio(value: string): boolean {
  return DAILY_FOLIO.test(value);
}

/** "A-260918-042": year, month, day in the business's own calendar, then the day's running number. */
export function formatFolio(date: { year: number; month: number; day: number }, number: number): string {
  const yy = String(date.year % 100).padStart(2, "0");
  const mm = String(date.month).padStart(2, "0");
  const dd = String(date.day).padStart(2, "0");
  return `A-${yy}${mm}${dd}-${String(number).padStart(3, "0")}`;
}

/**
 * What the kitchen and the board show: "A-042", the same width a legacy folio
 * had, so a card sized for "A-0042" does not wrap. The date is on the card's
 * clock, and the full folio stays on everything a guest or a report reads.
 */
export function shortFolio(value: string): string {
  const match = DAILY_FOLIO.exec(value);
  return match ? `A-${match[1]}` : value;
}

type ParsedFolio = { date: string | null; number: number };

const QUERY = /^(?:A-?)?(?:(\d{6})-)?(\d+)$/;
const STORED = /^A-(?:(\d{6})-)?(\d+)$/;

function parse(pattern: RegExp, text: string): ParsedFolio | null {
  const match = pattern.exec(text);
  return match ? { date: match[1] ?? null, number: Number(match[2]) } : null;
}

/**
 * Whether something a person typed or shouted names this order, in any form
 * the kitchen and the till use for it: "A-042", "042", "42", "a042", the full
 * "A-260918-042", or a legacy "A-0042". Numbers compare as numbers, so padding
 * does not matter; a query that carries a date must match the order's date.
 *
 * A bare number names every order with that running number, one per day, so a
 * caller searching more than today's orders has to scope it (by date) itself.
 */
export function folioMatches(query: string, orderNumber: string): boolean {
  const typed = parse(QUERY, query.trim().toUpperCase().replace(/[\s‐-―]/g, (c) => (/\s/.test(c) ? "" : "-")));
  const stored = parse(STORED, orderNumber);
  if (!typed || !stored) return false;
  if (typed.number !== stored.number) return false;
  return typed.date === null || typed.date === stored.date;
}
