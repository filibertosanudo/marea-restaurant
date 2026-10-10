import "server-only";
import type { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * A sample row becomes the owner's the moment they do anything to that
 * specific row. "Delete sample data" selects on isSample and nothing else, so
 * forgetting to adopt here is the dangerous direction: the button would
 * delete something the restaurant already edited and sells. Called from every
 * action that expresses intent about one row; lib/onboarding/
 * sample-adoption.test.ts walks the action files and fails for one that
 * neither calls it nor says, in its EXEMPT list, why not.
 *
 * Plain updateMany scoped by businessId and isSample: a no-op for an ordinary
 * row, and never able to touch another business's.
 */
type Db = Pick<PrismaClient, "menuItem" | "menuCategory" | "restaurantTable">;

export async function adoptSampleMenuItem(db: Db, businessId: string, id: string): Promise<void> {
  await db.menuItem.updateMany({ where: { id, businessId, isSample: true }, data: { isSample: false } });
}

export async function adoptSampleCategory(db: Db, businessId: string, id: string): Promise<void> {
  await db.menuCategory.updateMany({ where: { id, businessId, isSample: true }, data: { isSample: false } });
}

export async function adoptSampleTable(db: Db, businessId: string, id: string): Promise<void> {
  await db.restaurantTable.updateMany({ where: { id, businessId, isSample: true }, data: { isSample: false } });
}
