/**
 * Deletes LoginAttempt and RateLimitCounter rows older than 90 days — both
 * store IP addresses, personal data under the LFPDPPP. Safe to run on a
 * schedule: purely a retention limit, no judgment call involved (compare
 * scripts/anonymize-old-guests.ts, which is deliberately not automatic).
 * `--dry-run` only counts, and skips the run log and the monitor ping — it
 * is a preview, not a scheduled run.
 *
 *   npm run privacy:purge-ip-data [-- --dry-run]
 */
import "dotenv/config";
import { env } from "../lib/env";
import { prisma } from "../lib/prisma";
import { purgeOldIpData } from "../lib/ops/purge-ip-data";
import { runScheduled } from "../lib/ops/scheduled-task";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const now = new Date();

  if (dryRun) {
    const { loginAttempts, rateLimitCounters, cutoff } = await purgeOldIpData(now, true);
    console.log(`Would delete ${loginAttempts} LoginAttempt row(s) and ${rateLimitCounters} RateLimitCounter row(s) older than ${cutoff.toISOString()}.`);
    return;
  }

  const outcome = await runScheduled("purge-ip-data", "daily", env.OPS_MONITOR_PURGE_IP_URL, async () => {
    const { loginAttempts, rateLimitCounters, cutoff } = await purgeOldIpData(now, false);
    return {
      processed: loginAttempts + rateLimitCounters,
      detail: `Deleted ${loginAttempts} LoginAttempt row(s) and ${rateLimitCounters} RateLimitCounter row(s) older than ${cutoff.toISOString()}.`,
    };
  });
  console.log(`[privacy:purge-ip-data] ${outcome}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
