/**
 * Deletes RateLimitCounter rows old enough that no caller's window could
 * still read them. Nothing purges this table on its own — every write is a
 * plain insert (see lib/auth/rate-limit.ts) — so without this it only grows.
 *
 * 24h is a fixed margin well past the longest window any scope uses today
 * (password:reset's 60 minutes); a scope with a longer window later just
 * needs this constant raised, not a per-scope schedule.
 *
 *   npm run rate-limits:purge [-- --dry-run]
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";

const RETENTION_MS = 24 * 60 * 60 * 1000;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const cutoff = new Date(Date.now() - RETENTION_MS);

  if (dryRun) {
    const count = await prisma.rateLimitCounter.count({ where: { createdAt: { lt: cutoff } } });
    console.log(`Would delete ${count} row(s) older than ${cutoff.toISOString()}.`);
    return;
  }

  const { count } = await prisma.rateLimitCounter.deleteMany({ where: { createdAt: { lt: cutoff } } });
  console.log(`Deleted ${count} row(s) older than ${cutoff.toISOString()}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
