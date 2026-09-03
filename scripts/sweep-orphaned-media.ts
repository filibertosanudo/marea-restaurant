/**
 * Removes orphaned media: uploadMenuItemImageAction/updateMenuItemAction
 * delete an old image key right after committing the new one, best-effort
 * and outside the transaction — a crash between those two steps leaves the
 * key orphaned. Run by hand or on a schedule; never touches a key any
 * MenuItem row (deleted or not) still points at.
 *
 *   npm run storage:sweep [-- --dry-run]
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
