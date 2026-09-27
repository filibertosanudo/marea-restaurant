import "server-only";
import { prisma } from "@/lib/prisma";
import { systemPrisma } from "@/lib/db/system";
import { runInTenant } from "@/lib/tenancy/context";
import { getStorageDriver } from "@/lib/storage";

const PREFIX = "menu-items/";

export type MediaSweepResult = { orphaned: string[] };

/**
 * Finds (and, unless `dryRun`, deletes) stored media keys no MenuItem row
 * references. uploadMenuItemImageAction/updateMenuItemAction delete an old
 * image key right after committing the new one, best-effort and outside the
 * transaction — a crash between those two steps is what leaves a key
 * orphaned. Never touches a key any MenuItem row (deleted or not) still
 * points at.
 */
export async function sweepOrphanedMedia(dryRun: boolean): Promise<MediaSweepResult> {
  const driver = getStorageDriver();

  // Row level security shows a connection one business at a time, so the
  // references are gathered business by business. Reading them all at once
  // would see none, and every stored key would look orphaned.
  const businesses = await systemPrisma.business.findMany({ select: { id: true } });
  const [storedKeys, referenced] = await Promise.all([
    driver.list(PREFIX),
    Promise.all(
      businesses.map((business) =>
        runInTenant(business.id, () =>
          prisma.menuItem.findMany({ where: { businessId: business.id, imageUrl: { not: null } }, select: { imageUrl: true } })
        )
      )
    ).then((perBusiness) => perBusiness.flat()),
  ]);

  const referencedKeys = new Set(
    referenced.map((item) => (item.imageUrl ? driver.keyFromUrl(item.imageUrl) : null)).filter((key): key is string => key !== null)
  );
  const orphaned = storedKeys.filter((key) => !referencedKeys.has(key));

  if (!dryRun) for (const key of orphaned) await driver.delete(key);
  return { orphaned };
}
