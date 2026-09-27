/**
 * Deletes RateLimitCounter rows old enough that no caller's window could
 * still read them. Nothing purges this table on its own — every write is a
 * plain insert (see lib/auth/rate-limit.ts) — so without this it only
 * grows. `--dry-run` only counts, and skips the run log and the monitor
 * ping — it is a preview, not a scheduled run.
 *
 *   npm run rate-limits:purge [-- --dry-run]
 */
import "dotenv/config";
import { env } from "../lib/env";
import { prisma } from "../lib/prisma";
import { purgeRateLimits } from "../lib/ops/purge-rate-limits";
import { runScheduled } from "../lib/ops/scheduled-task";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const now = new Date();

  if (dryRun) {
    const { count, cutoff } = await purgeRateLimits(now, true);
    console.log(`Would delete ${count} row(s) older than ${cutoff.toISOString()}.`);
    return;
  }

  const outcome = await runScheduled("rate-limits-purge", "hourly", env.OPS_MONITOR_RATE_LIMITS_URL, async () => {
    const { count, cutoff } = await purgeRateLimits(now, false);
    return { processed: count, detail: `Deleted ${count} row(s) older than ${cutoff.toISOString()}.` };
  });
  console.log(`[rate-limits:purge] ${outcome}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
