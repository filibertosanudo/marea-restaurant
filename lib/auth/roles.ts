import "server-only";
import { UserRole } from "@/lib/generated/prisma/client";

type MembershipLike = { role: UserRole; isActive: boolean };

/** What decides a user's role at one business. `memberships` are the user's memberships AT THAT business, not all of them. */
type ActingUser = {
  role: UserRole;
  organizationId: string | null;
  memberships: MembershipLike[];
};

/**
 * The role a user has when acting on one business, or null when they may not
 * act on it at all. Pure: the rule and nothing else. lib/auth/business-access.ts
 * feeds it the facts and is the only caller that should.
 *
 *   SUPER_ADMIN   platform operator, any business.
 *   ORG_ADMIN     the owner of a chain: BUSINESS_ADMIN at every business of
 *                 their own organization, and nothing at any other. The role a
 *                 session carries is the one held AT the active business, so
 *                 every check downstream (requireRole, the permission matrix)
 *                 sees BUSINESS_ADMIN and needed no change.
 *   anyone else   the role of their active membership at that business.
 *
 * Deliberately its own module, with no dependency on auth.ts or
 * lib/auth/session.ts: auth.ts imports this, so if it lived in
 * lib/auth/permissions.ts (which imports lib/auth/session.ts, which imports
 * auth.ts) the two would form an import cycle back into the module currently
 * being defined.
 */
export function roleAtBusiness(user: ActingUser, business: { organizationId: string | null }): UserRole | null {
  if (user.role === UserRole.SUPER_ADMIN) return UserRole.SUPER_ADMIN;
  if (
    user.role === UserRole.ORG_ADMIN &&
    user.organizationId !== null &&
    user.organizationId === business.organizationId
  ) {
    return UserRole.BUSINESS_ADMIN;
  }
  return user.memberships.find((m) => m.isActive)?.role ?? null;
}

/**
 * The role groupings the orders module checks over and over (board
 * actions, the SSE route) — defined once so a future role change can't
 * desync "who can act on an order" from "who can watch the live stream".
 * ORG_ADMIN is not in either list on purpose: a session never carries it, see
 * roleAtBusiness.
 */
export const STAFF_ROLES: UserRole[] = [
  UserRole.STAFF,
  UserRole.BUSINESS_ADMIN,
  UserRole.SUPER_ADMIN,
];
export const ADMIN_ROLES: UserRole[] = [UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN];

/**
 * The single BUSINESS_ADMIN+ check pages use to decide what to render for
 * the current session (cancel a pedido, refund a payment, edit the menu —
 * every "the matrix says only an admin" UI gate) — one allowlist instead of
 * each page independently writing `role !== STAFF`, which reads as an
 * exclusion (permits everything that isn't STAFF) rather than the
 * allowlist the permission matrix actually specifies.
 */
export function isAdminRole(role: UserRole): boolean {
  return ADMIN_ROLES.includes(role);
}
