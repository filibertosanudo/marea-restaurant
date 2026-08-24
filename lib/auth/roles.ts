import "server-only";
import { UserRole } from "@/lib/generated/prisma/client";

type MembershipLike = { role: UserRole; isActive: boolean };
type UserLike = { role: UserRole; memberships: MembershipLike[] };

/**
 * Resolves the single effective role for a user, in one place, per the
 * documented hierarchy: SUPER_ADMIN (a platform-level flag on User.role)
 * always wins; otherwise the role of their active BusinessMembership;
 * otherwise CUSTOMER. Called at sign-in (embedded in the JWT) and again by
 * the jwt callback's periodic revalidation.
 *
 * Deliberately its own module, with no dependency on auth.ts or
 * lib/auth/session.ts: auth.ts imports this function, so if it lived in
 * lib/auth/permissions.ts (which imports lib/auth/session.ts, which imports
 * auth.ts) the two would form an import cycle back into the module
 * currently being defined.
 */
export function getEffectiveRole(user: UserLike): UserRole {
  if (user.role === UserRole.SUPER_ADMIN) return UserRole.SUPER_ADMIN;
  const membership = user.memberships.find((m) => m.isActive);
  return membership?.role ?? UserRole.CUSTOMER;
}
