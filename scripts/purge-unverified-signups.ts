/**
 * Deletes organizations whose signup was never verified within its token's
 * lifetime (module 19, phase 3) — frees the slug for the real restaurant
 * that might want it. Safe to run on a schedule: a candidate is re-checked
 * at delete time, so verifying a second before this runs is never a race
 * that loses a real business. `--dry-run` only counts, and skips the run
 * log and the monitor ping — it is a preview, not a scheduled run.
 *
 *   npm run signup:purge-unverified [-- --dry-run]
 */
import "dotenv/config";
import { env } from "../lib/env";
import { prisma } from "../lib/prisma";
import { purgeUnverifiedSignups } from "../lib/ops/purge-unverified-signups";
import { runScheduled } from "../lib/ops/scheduled-task";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const now = new Date();

  if (dryRun) {
    const { candidates, cutoff } = await purgeUnverifiedSignups(now, true);
    console.log(`Would delete ${candidates} unverified signup(s) created before ${cutoff.toISOString()}.`);
    return;
  }

  const outcome = await runScheduled("purge-unverified-signups", "daily", env.OPS_MONITOR_PURGE_UNVERIFIED_SIGNUPS_URL, async () => {
    const { candidates, purged, cutoff } = await purgeUnverifiedSignups(now, false);
    return {
      processed: purged,
      detail: `Deleted ${purged} of ${candidates} unverified signup(s) created before ${cutoff.toISOString()}.`,
    };
  });
  console.log(`[signup:purge-unverified] ${outcome}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
