/**
 * Removes orphaned media: uploadMenuItemImageAction/updateMenuItemAction
 * delete an old image key right after committing the new one, best-effort
 * and outside the transaction — a crash between those two steps leaves the
 * key orphaned. `--dry-run` only lists, and skips the run log and the
 * monitor ping — it is a preview, not a scheduled run.
 *
 *   npm run storage:sweep [-- --dry-run]
 */
import "dotenv/config";
import { env } from "../lib/env";
import { prisma } from "../lib/prisma";
import { sweepOrphanedMedia } from "../lib/ops/media-sweep";
import { runScheduled } from "../lib/ops/scheduled-task";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  if (dryRun) {
    const { orphaned } = await sweepOrphanedMedia(true);
    if (orphaned.length === 0) {
      console.log("No orphaned media found.");
      return;
    }
    console.log(`${orphaned.length} orphaned key(s) (dry run, not deleting):`);
    for (const key of orphaned) console.log(`  ${key}`);
    return;
  }

  const outcome = await runScheduled("media-sweep", "daily", env.OPS_MONITOR_MEDIA_SWEEP_URL, async () => {
    const { orphaned } = await sweepOrphanedMedia(false);
    return { processed: orphaned.length, detail: orphaned.length ? `Deleted: ${orphaned.join(", ")}` : "No orphaned media found." };
  });
  console.log(`[storage:sweep] ${outcome}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
