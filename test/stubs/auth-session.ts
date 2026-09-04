// Stand-in for lib/auth/session.ts's getSession() in integration tests —
// requireRole/requirePageRole call this to resolve who's calling, and
// there's no live next-auth JWT to back it outside of a real request.
// Wired in via vi.mock in test/setup.integration.ts; the actual
// authorization logic in lib/auth/permissions.ts stays real, only this
// one boundary is faked.
import type { Session } from "next-auth";
import type { User } from "@/lib/generated/prisma/client";

let current: Session | null = null;

export function getSession(): Promise<Session | null> {
  return Promise.resolve(current);
}

export function setTestSession(user: Session["user"]): void {
  current = { user, expires: new Date(Date.now() + 3_600_000).toISOString() };
}

export function clearTestSession(): void {
  current = null;
}

/** Builds a session user from a real User row (see factories.ts's makeStaff), with revoked/businessId defaulted and overridable — the shape lib/auth/permissions.ts's requireRole actually checks. */
export function sessionUserFromRow(
  user: Pick<User, "id" | "email" | "name" | "role" | "mustChangePassword">,
  overrides: Partial<Session["user"]> = {}
): Session["user"] {
  return {
    id: user.id,
    email: user.email ?? "",
    name: user.name,
    role: user.role,
    businessId: null,
    mustChangePassword: user.mustChangePassword,
    revoked: false,
    ...overrides,
  };
}
