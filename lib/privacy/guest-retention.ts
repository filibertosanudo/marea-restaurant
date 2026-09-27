import "server-only";
import { prisma } from "@/lib/prisma";
import { systemPrisma } from "@/lib/db/system";
import { runInTenant } from "@/lib/tenancy/context";

/** 24 months, treated as 30-day months — shared by the count (this file) and the anonymize command itself. */
export const GUEST_RETENTION_MS = 24 * 30 * 24 * 60 * 60 * 1000;

export type OverdueGuestCounts = { businessId: string; businessName: string; orders: number; reservations: number };

function whereClauses(businessId: string, cutoff: Date) {
  return {
    orderWhere: {
      businessId,
      createdAt: { lt: cutoff },
      OR: [{ guestName: { not: null } }, { guestEmail: { not: null } }, { guestPhone: { not: null } }],
    },
    reservationWhere: {
      businessId,
      createdAt: { lt: cutoff },
      OR: [{ guestName: { not: "" } }, { guestEmail: { not: null } }, { guestPhone: { not: null } }],
    },
  };
}

/**
 * How many Order/Reservation rows, per business, are old enough for
 * `npm run privacy:anonymize-guests` to touch — read-only, the same counting
 * query that script's own `--dry-run` runs. Used by the monthly report
 * (scripts/ops/anonymize-alert.ts) so someone is told the decision is due;
 * it never anonymizes anything itself.
 */
export async function countOverdueGuests(now = new Date()): Promise<OverdueGuestCounts[]> {
  const cutoff = new Date(now.getTime() - GUEST_RETENTION_MS);
  const businesses = await systemPrisma.business.findMany({ select: { id: true, name: true } });
  const counts: OverdueGuestCounts[] = [];
  for (const { id: businessId, name: businessName } of businesses) {
    const { orderWhere, reservationWhere } = whereClauses(businessId, cutoff);
    const [orders, reservations] = await runInTenant(businessId, () =>
      Promise.all([prisma.order.count({ where: orderWhere }), prisma.reservation.count({ where: reservationWhere })])
    );
    if (orders > 0 || reservations > 0) counts.push({ businessId, businessName, orders, reservations });
  }
  return counts;
}
