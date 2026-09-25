/**
 * Blanks guestName/guestEmail/guestPhone on Order and Reservation rows
 * older than 24 months. Amounts, dates, and everything else are left
 * untouched — they're accounting records and have to keep reconciling.
 *
 * Deliberately NOT wired into any scheduled job: this is the one privacy
 * command that makes an irreversible decision (whose contact info to
 * erase), so it stays a decision someone makes on purpose, not a surprise
 * a cron job made for them. Compare scripts/purge-old-ip-data.ts, which is
 * pure retention with no judgment call and is safe to schedule.
 *
 *   npm run privacy:anonymize-guests [-- --dry-run]
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { runInTenant } from "../lib/tenancy/context";

const RETENTION_MS = 24 * 30 * 24 * 60 * 60 * 1000; // 24 months, treated as 30-day months

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const cutoff = new Date(Date.now() - RETENTION_MS);

  const scrubbed = { guestName: "", guestEmail: null, guestPhone: null };

  // One business at a time: row level security shows a connection a single
  // business, so a query with no businessId would touch none of them.
  const businesses = await prisma.business.findMany({ select: { id: true } });
  let orders = 0;
  let reservations = 0;
  for (const { id: businessId } of businesses) {
    const orderWhere = {
      businessId,
      createdAt: { lt: cutoff },
      OR: [{ guestName: { not: null } }, { guestEmail: { not: null } }, { guestPhone: { not: null } }],
    };
    const reservationWhere = {
      businessId,
      createdAt: { lt: cutoff },
      OR: [{ guestName: { not: "" } }, { guestEmail: { not: null } }, { guestPhone: { not: null } }],
    };
    await runInTenant(businessId, async () => {
      if (dryRun) {
        orders += await prisma.order.count({ where: orderWhere });
        reservations += await prisma.reservation.count({ where: reservationWhere });
      } else {
        orders += (await prisma.order.updateMany({ where: orderWhere, data: scrubbed })).count;
        reservations += (await prisma.reservation.updateMany({ where: reservationWhere, data: scrubbed })).count;
      }
    });
  }
  console.log(
    `${dryRun ? "Would anonymize" : "Anonymized"} ${orders} Order row(s) and ${reservations} Reservation row(s) created before ${cutoff.toISOString()}.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
