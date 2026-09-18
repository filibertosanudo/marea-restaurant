import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { businessLocalDateParts } from "@/lib/reservations/availability";

// Old folios are "A-" plus digits ("A-0042"); new ones carry the business's
// local date and a second hyphen ("A-260918-042"), so no new folio can ever
// equal an old one and Order's @@unique([businessId, orderNumber]) keeps
// protecting a single namespace.
const LEGACY_FOLIO = /^A-\d+$/;
const DAILY_FOLIO = /^A-\d{6}-\d{3,}$/;

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
 * Takes the next number of the business's day, in one statement: the upsert
 * either creates today's counter at 1 or bumps it, and RETURNING hands back
 * the value this transaction alone was given. The row stays locked until the
 * surrounding transaction ends, so callers take the folio as late as they
 * can, right before inserting the order, not at the start.
 */
export async function nextFolio(
  tx: Prisma.TransactionClient,
  businessId: string,
  timezone: string,
  now: Date = new Date()
): Promise<string> {
  const date = businessLocalDateParts(now, timezone);
  const localDate = `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
  const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
    INSERT INTO "OrderCounter" ("businessId", "localDate", "lastNumber")
    VALUES (${businessId}, ${localDate}, 1)
    ON CONFLICT ("businessId", "localDate")
    DO UPDATE SET "lastNumber" = "OrderCounter"."lastNumber" + 1
    RETURNING "lastNumber"
  `;
  return formatFolio(date, rows[0].lastNumber);
}
