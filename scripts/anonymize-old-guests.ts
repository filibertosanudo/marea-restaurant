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

const RETENTION_MS = 24 * 30 * 24 * 60 * 60 * 1000; // 24 months, treated as 30-day months

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const cutoff = new Date(Date.now() - RETENTION_MS);

  const scrubbed = { guestName: "", guestEmail: null, guestPhone: null };

  if (dryRun) {
    const [orders, reservations] = await Promise.all([
      prisma.order.count({
        where: { createdAt: { lt: cutoff }, OR: [{ guestName: { not: null } }, { guestEmail: { not: null } }, { guestPhone: { not: null } }] },
      }),
      prisma.reservation.count({
        where: { createdAt: { lt: cutoff }, OR: [{ guestName: { not: "" } }, { guestEmail: { not: null } }, { guestPhone: { not: null } }] },
      }),
    ]);
    console.log(`Would anonymize ${orders} Order row(s) and ${reservations} Reservation row(s) created before ${cutoff.toISOString()}.`);
    return;
  }

  const [orders, reservations] = await Promise.all([
    prisma.order.updateMany({
      where: { createdAt: { lt: cutoff }, OR: [{ guestName: { not: null } }, { guestEmail: { not: null } }, { guestPhone: { not: null } }] },
      data: scrubbed,
    }),
    prisma.reservation.updateMany({
      where: { createdAt: { lt: cutoff }, OR: [{ guestName: { not: "" } }, { guestEmail: { not: null } }, { guestPhone: { not: null } }] },
      data: scrubbed,
    }),
  ]);
  console.log(`Anonymized ${orders.count} Order row(s) and ${reservations.count} Reservation row(s) created before ${cutoff.toISOString()}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
