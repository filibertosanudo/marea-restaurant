import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { businessLocalDateParts } from "@/lib/reservations/availability";
import { formatFolio } from "@/lib/orders/folio-format";

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
