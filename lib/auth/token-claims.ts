import "server-only";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/lib/generated/prisma/client";
import { authorizeBusiness } from "@/lib/auth/business-access";
import { isRevokedByPasswordChange } from "@/lib/auth/token-revalidation";

/**
 * What a session token asserts about its user. The `jwt` callback in auth.ts
 * only stores what these functions return; every decision is made here, where
 * it can be exercised against a real database (the callback itself cannot run
 * outside Next, see test/stubs/auth-config.ts).
 */
export type TokenClaims = {
  role: UserRole;
  businessId: string | null;
  /** The user administers a chain: the switcher and the consolidated report are theirs. Their `role` is the one held at the active business. */
  orgAdmin: boolean;
  mustChangePassword: boolean;
};

async function claimsAt(userId: string, businessId: string | null): Promise<TokenClaims | null> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { role: true, mustChangePassword: true },
  });
  if (!user) return null;
  const orgAdmin = user.role === UserRole.ORG_ADMIN;

  // No business: only the platform operator, who works from the host.
  if (businessId === null) {
    return user.role === UserRole.SUPER_ADMIN
      ? { role: UserRole.SUPER_ADMIN, businessId: null, orgAdmin: false, mustChangePassword: user.mustChangePassword }
      : null;
  }

  const role = await authorizeBusiness(userId, businessId);
  return role ? { role, businessId, orgAdmin, mustChangePassword: user.mustChangePassword } : null;
}

/** The claims for a session that is starting on this business (sign-in). */
export function claimsForSignIn(userId: string, businessId: string | null): Promise<TokenClaims | null> {
  return claimsAt(userId, businessId);
}

/**
 * The periodic re-check of an existing token against the database, or null when
 * the session must end: the account is gone, the password changed since the
 * token was issued, or the user may no longer act on the business the token
 * names. The business is re-authorised every time, through the same function
 * the switcher uses, because the token's businessId is what row level security
 * is told.
 */
export async function revalidateClaims(token: {
  sub: string;
  businessId: string | null;
  iat?: number;
}): Promise<TokenClaims | null> {
  const user = await prisma.user.findUnique({ where: { id: token.sub }, select: { passwordChangedAt: true } });
  if (!user) return null;
  if (isRevokedByPasswordChange(user.passwordChangedAt, token.iat)) return null;
  return claimsAt(token.sub, token.businessId);
}

/**
 * The claims after a request to switch business, or null when the user may not
 * act on it. The request is untrusted: a session update can be posted by the
 * browser with any payload, so nothing about it is believed until
 * authorizeBusiness says so.
 */
export function claimsForSwitch(userId: string, requestedBusinessId: string): Promise<TokenClaims | null> {
  return claimsAt(userId, requestedBusinessId);
}

type UpdatableToken = {
  sub?: string;
  role: UserRole;
  businessId: string | null;
  orgAdmin: boolean;
  mustChangePassword: boolean;
  checkedAt: number;
};

/**
 * What the `jwt` callback does on a session update: honour a request to switch
 * business, ignore everything else. The payload is whatever was posted to the
 * session endpoint, so only `switchBusinessId` is read, as a string, and it is
 * taken only if claimsForSwitch allows it. A refused or malformed request
 * returns the token untouched; a payload that tries to set role, businessId or
 * anything else directly is not looked at.
 */
export async function tokenAfterUpdate<T extends UpdatableToken>(token: T, payload: unknown): Promise<T> {
  const requested = (payload as { switchBusinessId?: unknown } | null)?.switchBusinessId;
  if (typeof requested !== "string" || !token.sub) return token;

  const claims = await claimsForSwitch(token.sub, requested);
  if (!claims) return token;
  return { ...token, ...claims, checkedAt: Date.now() };
}
