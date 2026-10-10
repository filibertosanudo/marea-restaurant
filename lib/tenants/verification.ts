import type { PrismaClient } from "@/lib/generated/prisma/client";
import { runWithoutTenant } from "@/lib/tenancy/context";

export type Verified = { userId: string; organizationId: string };

/**
 * Verifies a signup from its emailed token's hash, in one call inside the
 * database: finds the token, requires it unused and unexpired, marks it used
 * and stamps the user's email and the organization as verified. Null for a
 * token that is unknown, expired or already used, all alike. There is no
 * function that verifies an organization without its token: the write marea_app
 * cannot make with an ordinary UPDATE (Organization is read-only to it) has
 * exactly this one door.
 */
export async function verifyByToken(db: Pick<PrismaClient, "$queryRaw">, tokenHash: string): Promise<Verified | null> {
  const [row] = await runWithoutTenant(() =>
    db.$queryRaw<Array<{ user_id: string; organization_id: string }>>`SELECT user_id, organization_id FROM marea_verify_organization(${tokenHash})`
  );
  return row ? { userId: row.user_id, organizationId: row.organization_id } : null;
}
/**
 * Organizations still unverified past `cutoff`. marea_app has no way to read
 * this from "Organization" directly outside a business context (this
 * module's own row level security), which is exactly the situation
 * lib/ops/purge-unverified-signups.ts runs in. Ids only: the purge derives
 * everything else itself, inside the database.
 */
export async function listUnverifiedSignups(db: Pick<PrismaClient, "$queryRaw">, cutoff: Date): Promise<string[]> {
  const rows = await runWithoutTenant(() =>
    db.$queryRaw<Array<{ organization_id: string }>>`SELECT organization_id FROM marea_unverified_signups(${cutoff})`
  );
  return rows.map((row) => row.organization_id);
}

/**
 * Deletes a signup nobody verified: its business (every direct child of
 * Business cascades), the users that only existed for it, and the
 * organization. Takes the organization and nothing else: which users go is
 * decided inside the database, and one with a foot outside this organization
 * stays. Re-checks verifiedAt IS NULL itself, so a stale caller can never
 * delete a business that got verified in the meantime; that case returns
 * false, the same "nothing to do" shape.
 */
export async function purgeUnverifiedSignup(db: Pick<PrismaClient, "$queryRaw">, organizationId: string): Promise<boolean> {
  const [row] = await runWithoutTenant(() =>
    db.$queryRaw<Array<{ marea_purge_unverified_signup: boolean | null }>>`SELECT marea_purge_unverified_signup(${organizationId})`
  );
  return row?.marea_purge_unverified_signup === true;
}
