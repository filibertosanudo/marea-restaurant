/**
 * Marea — orphaned media sweep
 * ---------------------------------------------------------------------------
 * uploadMenuItemImageAction/updateMenuItemAction delete an image's old key
 * right after committing the new one — best-effort, outside the transaction
 * (see the comment in lib/menu/item-actions.ts for why). A crash between
 * those two steps leaves the old key orphaned: no row references it, and
 * nothing cleans it up on its own. This script finds and removes those.
 *
 * Run by hand or on a schedule (e.g. a weekly cron): it never touches a key
 * that any MenuItem row — deleted or not — still points at.
 *
 *   npm run storage:sweep
 *   npm run storage:sweep -- --dry-run
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { getStorageDriver } from "../lib/storage";

const PREFIX = "menu-items/";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const driver = getStorageDriver();

  const [storedKeys, referenced] = await Promise.all([
    driver.list(PREFIX),
    prisma.menuItem.findMany({
      where: { imageUrl: { not: null } },
      select: { imageUrl: true },
    }),
  ]);

  const referencedKeys = new Set(
    referenced
      .map((item) => (item.imageUrl ? driver.keyFromUrl(item.imageUrl) : null))
      .filter((key): key is string => key !== null)
  );

  const orphaned = storedKeys.filter((key) => !referencedKeys.has(key));

  if (orphaned.length === 0) {
    console.log("No orphaned media found.");
    return;
  }

  console.log(`${orphaned.length} orphaned key(s)${dryRun ? " (dry run, not deleting)" : ""}:`);
  for (const key of orphaned) {
    console.log(`  ${key}`);
    if (!dryRun) await driver.delete(key);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
