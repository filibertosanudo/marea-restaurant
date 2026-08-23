import "server-only";
import { redirect } from "next/navigation";
import { UserRole } from "@/lib/generated/prisma/client";
import { auth } from "@/auth";
import type { Session } from "next-auth";

type MembershipLike = { role: UserRole; isActive: boolean };
type UserLike = { role: UserRole; memberships: MembershipLike[] };

/**
 * Resolves the single effective role for a user, in one place, per the
 * documented hierarchy: SUPER_ADMIN (a platform-level flag on User.role)
 * always wins; otherwise the role of their active BusinessMembership;
 * otherwise CUSTOMER. Called once at sign-in — the result is embedded in
 * the JWT so later requests never need to re-query the database for it.
 */
export function getEffectiveRole(user: UserLike): UserRole {
  if (user.role === UserRole.SUPER_ADMIN) return UserRole.SUPER_ADMIN;
  const membership = user.memberships.find((m) => m.isActive);
  return membership?.role ?? UserRole.CUSTOMER;
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Server-side authorization gate. Call this as the first line of every
 * Server Action that mutates data — hiding a button in the UI is not a
 * permission, this is. Throws ForbiddenError (never silently no-ops) so a
 * bypassed check fails loudly instead of pretending to succeed.
 */
export async function requireRole(
  ...roles: UserRole[]
): Promise<Session> {
  const session = await auth();
  if (!session?.user) {
    throw new ForbiddenError("Not authenticated");
  }
  if (session.user.mustChangePassword) {
    throw new ForbiddenError("Password change required before continuing");
  }
  if (!roles.includes(session.user.role)) {
    throw new ForbiddenError("Insufficient role");
  }
  return session;
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
  const session = await auth();
  if (!session?.user || session.user.mustChangePassword || !roles.includes(session.user.role)) {
    redirect(redirectTo);
  }
  return session;
}
