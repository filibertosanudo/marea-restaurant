import type { PrismaClient } from "@/lib/generated/prisma/client";
import { runWithoutTenant } from "@/lib/tenancy/context";

/**
 * Stamps Organization.verifiedAt, the one write marea_app cannot make
 * directly (organization_access revoked UPDATE along with INSERT/DELETE —
 * module 19, phase 0). Idempotent: a second call, or a call for an
 * organization that was never unverified to begin with, is a no-op that
 * returns false rather than an error — see the migration's own comment on
 * marea_verify_organization for why a 0-row UPDATE isn't a failure here.
 */
export async function verifyOrganization(db: Pick<PrismaClient, "$queryRaw">, organizationId: string): Promise<boolean> {
  const [row] = await runWithoutTenant(() =>
    db.$queryRaw<Array<{ marea_verify_organization: boolean | null }>>`SELECT marea_verify_organization(${organizationId})`
  );
  return row?.marea_verify_organization === true;
}

export type UnverifiedSignup = { organizationId: string; userId: string };

/**
 * Organizations still unverified past `cutoff`, each paired with its own
 * signup's user id — marea_app has no way to read this from "Organization"
 * directly outside a business context (this module's own row level security),
 * which is exactly the situation lib/ops/purge-unverified-signups.ts runs in.
 */
export async function listUnverifiedSignups(db: Pick<PrismaClient, "$queryRaw">, cutoff: Date): Promise<UnverifiedSignup[]> {
  const rows = await runWithoutTenant(() =>
    db.$queryRaw<Array<{ organization_id: string; user_id: string }>>`SELECT * FROM marea_unverified_signups(${cutoff})`
  );
  return rows.map((row) => ({ organizationId: row.organization_id, userId: row.user_id }));
}

/**
 * Deletes a signup nobody verified: its business (and everything under it —
 * every direct child of Business cascades), its one admin user, and the
 * organization itself. Re-checks verifiedAt IS NULL inside the same
 * SECURITY DEFINER call, so a stale caller can never delete a business that
 * got verified in the meantime; that case returns false, same shape as
 * verifyOrganization's own "nothing to do".
 */
export async function purgeUnverifiedSignup(
  db: Pick<PrismaClient, "$queryRaw">,
  input: { organizationId: string; userId: string }
): Promise<boolean> {
  const [row] = await runWithoutTenant(() =>
    db.$queryRaw<Array<{ marea_purge_unverified_signup: boolean | null }>>`SELECT marea_purge_unverified_signup(${input.organizationId}, ${input.userId})`
  );
  return row?.marea_purge_unverified_signup === true;
}
