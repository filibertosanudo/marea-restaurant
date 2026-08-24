import "server-only";
import { redirect } from "next/navigation";
import { UserRole } from "@/lib/generated/prisma/client";
import { getSession } from "@/lib/auth/session";
import type { Session } from "next-auth";

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
