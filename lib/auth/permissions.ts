import "server-only";
import { redirect } from "next/navigation";
import { UserRole } from "@/lib/generated/prisma/client";
import { getSession } from "@/lib/auth/session";
import { assertWritable } from "@/lib/ops/read-only";
import { assertBusinessWritable } from "@/lib/billing/degrade-guard";
import type { Session } from "next-auth";

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * What a write is allowed to do while the restaurant's subscription is unpaid
 * (module 19, phase 8; lib/billing/degrade.ts):
 * - "config": the default, everything requireRole guards. Stops at READ_ONLY.
 * - "operations": serving guests (orders, kitchen, cash, payments, staff
 *   reservations, sold-out). Stops only at SUSPENDED.
 * - "anyState": paying, reactivating, switching branch and reads. Never
 *   stops, or a restaurant behind on payment could not get out.
 * lib/ops/read-only-coverage.test.ts lists every action that uses the last
 * two, so widening one is a decision in review, not a typo.
 */
type DegradeScope = "config" | "operations" | "anyState";

async function authorize(roles: UserRole[], scope: DegradeScope): Promise<Session> {
  // First, per this module's own rule: nothing runs before it, not even
  // the session lookup (module 18, phase 6).
  await assertWritable();
  const session = await getSession();
  if (!session?.user) {
    throw new ForbiddenError("Not authenticated");
  }
  if (session.user.revoked) {
    throw new ForbiddenError("Session no longer valid");
  }
  if (session.user.mustChangePassword) {
    throw new ForbiddenError("Password change required before continuing");
  }
  if (!roles.includes(session.user.role)) {
    throw new ForbiddenError("Insufficient role");
  }
  if (scope !== "anyState" && session.user.businessId) {
    await assertBusinessWritable(session.user.businessId, scope);
  }
  return session;
}

/**
 * Server-side authorization gate. Call this as the first line of every
 * Server Action that mutates data — hiding a button in the UI is not a
 * permission, this is. Throws ForbiddenError (never silently no-ops) so a
 * bypassed check fails loudly instead of pretending to succeed.
 */
export async function requireRole(...roles: UserRole[]): Promise<Session> {
  return authorize(roles, "config");
}

/** requireRole for the writes that serve guests: they keep working until the restaurant is suspended. */
export async function requireOperationsRole(...roles: UserRole[]): Promise<Session> {
  return authorize(roles, "operations");
}

/** requireRole for paying, reactivating, switching branch and reads: they work on every step. */
export async function requireRoleInAnyState(...roles: UserRole[]): Promise<Session> {
  return authorize(roles, "anyState");
}

/**
 * Page-level guard for Server Components. Unlike requireRole (which throws
 * for Server Actions), this redirects — a STAFF member hitting an
 * admin-only URL directly should land somewhere real, not an error page.
 */
export async function requirePageRole(
  redirectTo: string,
  ...roles: UserRole[]
): Promise<Session> {
  const session = await getSession();
  if (
    !session?.user ||
    session.user.revoked ||
    session.user.mustChangePassword ||
    !roles.includes(session.user.role)
  ) {
    redirect(redirectTo);
  }
  return session;
}
