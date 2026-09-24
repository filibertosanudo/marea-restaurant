import "server-only";
import { prisma } from "@/lib/prisma";
import { SWEEP_EVENT_LIMIT } from "@/lib/realtime/timing";
import type { RealtimeEvent } from "@/lib/realtime/events";

type Row = { kind: "order" | "payment" | "cash"; businessId: string; orderId: string | null };

/**
 * Everything the four triggers would have announced since `since`, re-read
 * from the tables. Notifications sent while nobody was listening are gone, so
 * this is the only way to learn what a dropped connection missed.
 *
 * Runs on the regular Prisma pool, never on the LISTEN connection, which does
 * nothing else. `since` is compared as a UTC wall-clock: Prisma stores UTC in
 * these `timestamp` columns, and casting the ISO string drops its "Z" rather
 * than shifting it by the session's time zone.
 *
 * Distinct per (kind, business, order): ten changes to one order are one
 * refresh for the screen. Past SWEEP_EVENT_LIMIT it says so with a single
 * reconcile instead of a flood.
 */
export async function sweepChangesSince(since: Date): Promise<RealtimeEvent[]> {
  const from = since.toISOString();
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT DISTINCT kind, "businessId", "orderId" FROM (
      SELECT 'order' AS kind, o."businessId", e."orderId"
        FROM "OrderStatusEvent" e JOIN "Order" o ON o.id = e."orderId"
        WHERE e."createdAt" > ${from}::timestamp
      UNION ALL
      SELECT 'payment', p."businessId", p."orderId"
        FROM "Payment" p WHERE p."updatedAt" > ${from}::timestamp
      UNION ALL
      SELECT 'cash', s."businessId", NULL
        FROM "CashSession" s
        WHERE s."openedAt" > ${from}::timestamp OR s."closedAt" > ${from}::timestamp
      UNION ALL
      SELECT 'cash', s."businessId", NULL
        FROM "CashMovement" m JOIN "CashSession" s ON s.id = m."cashSessionId"
        WHERE m."createdAt" > ${from}::timestamp
    ) changes
    LIMIT ${SWEEP_EVENT_LIMIT + 1}
  `;
  if (rows.length > SWEEP_EVENT_LIMIT) return [{ kind: "reconcile", businessId: null }];
  return rows.map((r) => ({ kind: r.kind, businessId: r.businessId, orderId: r.orderId, status: null }));
}
