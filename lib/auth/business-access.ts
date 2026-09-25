import "server-only";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/lib/generated/prisma/client";
import { roleAtBusiness, STAFF_ROLES } from "@/lib/auth/roles";
import { runWithoutTenant } from "@/lib/tenancy/context";

/**
 * "May this user act on this business, and as what?" — the one place that
 * answers it.
 *
 * The answer ends up in the token's businessId, which proxy.ts turns into the
 * x-marea-tenant header, which the database connection turns into
 * app.business_id, which row level security obeys without question. So the
 * policy will open the door to whatever the token says, and this function is
 * what decides what the token may say. Three callers, all through here and
 * none with a check of their own:
 *
 *   - sign-in, choosing the business the session starts on;
 *   - the jwt callback's revalidation, every minute, against the token's
 *     current business;
 *   - the business switcher, before and inside the callback that applies it.
 *
 * Returns the role held AT that business (an ORG_ADMIN is BUSINESS_ADMIN
 * there), or null: no such business, an account that is gone, another
 * organization, no active membership, or a role that is not staff.
 */
export async function authorizeBusiness(userId: string, businessId: string): Promise<UserRole | null> {
  // Business rows are scoped to their own business, so "does it exist and
  // which organization is it in" is answered by a function that returns
  // exactly that, outside any business.
  const rows = await runWithoutTenant(() =>
    prisma.$queryRaw<Array<{ organization_id: string | null }>>`SELECT organization_id FROM marea_business_org(${businessId})`
  );
  if (rows.length === 0) return null;

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      role: true,
      organizationId: true,
      memberships: { where: { businessId, isActive: true }, select: { role: true, isActive: true } },
    },
  });
  if (!user) return null;

  const role = roleAtBusiness(user, { organizationId: rows[0].organization_id });
  return role && STAFF_ROLES.includes(role) ? role : null;
}

/** The businesses a user might act on, before authorisation: their active memberships, and every business of their organization. */
async function candidateBusinessIds(userId: string): Promise<string[]> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      organizationId: true,
      memberships: { where: { isActive: true }, orderBy: { createdAt: "asc" }, select: { businessId: true } },
    },
  });
  if (!user) return [];
  const own = user.memberships.map((m) => m.businessId);
  const ofOrganization = user.organizationId
    ? await runWithoutTenant(() =>
        prisma.$queryRaw<Array<{ id: string }>>`SELECT t.id FROM marea_organization_business_ids(${user.organizationId}::text) AS t(id)`
      ).then((rows) => rows.map((r) => r.id))
    : [];
  return [...new Set([...own, ...ofOrganization])];
}

/** The business a session starts on: the first one this user may act on, or null (a SUPER_ADMIN with no membership works from the host). */
export async function firstBusinessFor(userId: string): Promise<string | null> {
  for (const id of await candidateBusinessIds(userId)) {
    if (await authorizeBusiness(userId, id)) return id;
  }
  return null;
}

export type AccessibleBusiness = { id: string; name: string; slug: string };

/** What the switcher offers. Every candidate goes back through authorizeBusiness: nothing is listed that could not be switched to. */
export async function listAccessibleBusinesses(userId: string): Promise<AccessibleBusiness[]> {
  const allowed: string[] = [];
  for (const id of await candidateBusinessIds(userId)) {
    if (await authorizeBusiness(userId, id)) allowed.push(id);
  }
  if (allowed.length === 0) return [];
  return runWithoutTenant(() =>
    prisma.$queryRaw<AccessibleBusiness[]>`SELECT id, name, slug FROM marea_business_summaries(${allowed}::text[])`
  );
}

/**
 * The branches of this user's organization, each one authorised: what the
 * consolidated report may name. An empty list for anyone who is not an
 * ORG_ADMIN.
 */
export async function listOrganizationBusinesses(userId: string): Promise<AccessibleBusiness[]> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, role: "ORG_ADMIN" },
    select: { organizationId: true },
  });
  if (!user?.organizationId) return [];

  const ids = await runWithoutTenant(() =>
    prisma.$queryRaw<Array<{ id: string }>>`SELECT t.id FROM marea_organization_business_ids(${user.organizationId}::text) AS t(id)`
  );
  const allowed: string[] = [];
  for (const { id } of ids) {
    if (await authorizeBusiness(userId, id)) allowed.push(id);
  }
  if (allowed.length === 0) return [];
  return runWithoutTenant(() =>
    prisma.$queryRaw<AccessibleBusiness[]>`SELECT id, name, slug FROM marea_business_summaries(${allowed}::text[])`
  );
}
