/**
 * Deletes LoginAttempt and RateLimitCounter rows older than 90 days —
 * both store IP addresses, personal data under the LFPDPPP. Safe to run on
 * a schedule: purely a retention limit, no judgment call involved (compare
 * scripts/anonymize-old-guests.ts, which is deliberately not automatic).
 *
 * RateLimitCounter is already kept far leaner than this by
 * rate-limits:purge (24h, for query performance); this script's own cutoff
 * on that table is a no-op in practice but stated explicitly so the
 * retention limit doesn't depend on a second script's unrelated schedule.
 *
 *   npm run privacy:purge-ip-data [-- --dry-run]
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";

const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const cutoff = new Date(Date.now() - RETENTION_MS);

  if (dryRun) {
    const [loginAttempts, rateLimitCounters] = await Promise.all([
      prisma.loginAttempt.count({ where: { createdAt: { lt: cutoff } } }),
      prisma.rateLimitCounter.count({ where: { createdAt: { lt: cutoff } } }),
    ]);
    console.log(`Would delete ${loginAttempts} LoginAttempt row(s) and ${rateLimitCounters} RateLimitCounter row(s) older than ${cutoff.toISOString()}.`);
    return;
  }

  const [loginAttempts, rateLimitCounters] = await Promise.all([
    prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.rateLimitCounter.deleteMany({ where: { createdAt: { lt: cutoff } } }),
  ]);
  console.log(`Deleted ${loginAttempts.count} LoginAttempt row(s) and ${rateLimitCounters.count} RateLimitCounter row(s) older than ${cutoff.toISOString()}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
