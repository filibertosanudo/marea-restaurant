// Pure helpers with no server-only import, so client code can share them.

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
