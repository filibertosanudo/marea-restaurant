import "server-only";
import { prisma } from "@/lib/prisma";
import { runWithoutTenant } from "@/lib/tenancy/context";

/**
 * An organization's businesses, oldest first, through the SECURITY DEFINER
 * lookup sign-in already uses: Business is scoped to one row at a time, so
 * this cannot be a query. The first one is the business a billing write runs
 * inside, since OrganizationSubscription is reached through it.
 */
export async function organizationBusinessIds(organizationId: string): Promise<string[]> {
  const rows = await runWithoutTenant(() =>
    prisma.$queryRaw<Array<{ id: string }>>`SELECT t.id FROM marea_organization_business_ids(${organizationId}::text) AS t(id)`
  );
  return rows.map((row) => row.id);
}
