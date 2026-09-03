import "server-only";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

/**
 * Sliding-window login rate limit backed by Postgres (LoginAttempt), so it
 * survives deploys and works across multiple instances. Limits by email AND
 * by IP independently: a spray attack against thousands of distinct emails
 * from one IP still trips the per-IP limit even though no single email ever
 * repeats enough to trip its own.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_EMAIL = 5;
// Higher than the per-email limit: one IP (a restaurant's router, an office)
// legitimately covers several employees signing in around the same time.
const MAX_ATTEMPTS_PER_IP = 20;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function isRateLimited(email: string, ipAddress: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);
  const [byEmail, byIp] = await Promise.all([
    prisma.loginAttempt.count({
      where: { email: normalizeEmail(email), succeeded: false, createdAt: { gte: since } },
    }),
    prisma.loginAttempt.count({
      where: { ipAddress, succeeded: false, createdAt: { gte: since } },
    }),
  ]);
  return byEmail >= MAX_ATTEMPTS_PER_EMAIL || byIp >= MAX_ATTEMPTS_PER_IP;
}

export async function recordLoginAttempt(
  email: string,
  ipAddress: string,
  succeeded: boolean
): Promise<void> {
  await prisma.loginAttempt.create({
    data: { email: normalizeEmail(email), ipAddress, succeeded },
  });

  // One combined cleanup instead of two separate round-trips: a correct
  // password proves the account owner is behind the wheel, so a few earlier
  // typos (from them or a colleague on the same shared login) shouldn't
  // still count against them for the rest of the window — cleared by email
  // only, regardless of which IP they're on now. Separately, any login
  // attempt outside login's own window is dead weight regardless of whose
  // email it is — isRateLimited never reads past `since` anyway.
  //
  // The stale-row branch is scoped to `email: { contains: "@" }` — real
  // email addresses only — because this table is shared with
  // isScopeRateLimited/recordScopeAttempt below, which store a bare scope
  // string (never containing "@", by convention) in this same column with
  // their own, often longer, window. Without that filter, any login
  // anywhere deleted every scope's rows the moment they turned 15 minutes
  // old, silently shrinking a 60-minute reservation-creation window down to
  // login's own 15.
  await prisma.loginAttempt.deleteMany({
    where: {
      OR: [
        ...(succeeded ? [{ email: normalizeEmail(email), succeeded: false }] : []),
        { email: { contains: "@" }, createdAt: { lt: new Date(Date.now() - WINDOW_MS) } },
      ],
    },
  });
}

/**
 * Client IP from x-forwarded-for (x-real-ip as fallback), trusting exactly
 * `trustedProxyCount` hops counted from the *end* of the chain — never a
 * fixed position — because each trusted proxy appends its own peer, so
 * anything the client injected stays to the left of them.
 *
 * Only defends the per-IP limit; the per-email limit doesn't depend on it.
 */
export function getClientIp(
  headers: { get(name: string): string | null },
  trustedProxyCount: number = env.TRUSTED_PROXY_COUNT
): string {
  if (trustedProxyCount > 0) {
    const chain = (headers.get("x-forwarded-for") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // Fewer entries than trusted hops means a hop failed to append (or the
    // count is wrong) — nothing in the chain is provably trustworthy then,
    // so this falls through instead of guessing which entry is real.
    if (chain.length >= trustedProxyCount) {
      return chain[chain.length - trustedProxyCount];
    }
  }

  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

// Reuses MAX_ATTEMPTS_PER_IP/WINDOW_MS's own numbers for scopes that want
// "the same tolerance login gives one IP" rather than picking a fresh
// number with no precedent.
export const DEFAULT_SCOPE_MAX_ATTEMPTS_PER_IP = MAX_ATTEMPTS_PER_IP;
export const DEFAULT_SCOPE_WINDOW_MS = WINDOW_MS;

/**
 * The same sliding-window mechanics as isRateLimited/recordLoginAttempt,
 * generalized to any per-IP action instead of just login — reusing
 * LoginAttempt's table and indexes (the `scope` string lives in its
 * free-text `email` column) rather than a second table or a second
 * rate-limiting mechanism this module isn't authorized to add on its own.
 *
 * Unlike isRateLimited, this counts every attempt regardless of outcome:
 * a spammer's 200 *successful* reservations are exactly the harm being
 * limited, not just failed ones, so there's no `succeeded` filter here.
 *
 * Contract: `scope` must never contain "@" — recordLoginAttempt's own
 * stale-row cleanup uses that to tell a real login attempt from a scope
 * row sharing this table, so a scope shaped like an email would get its
 * rows swept by login's shorter window instead of living out its own.
 * Enforced at runtime by assertValidScope below, not just by convention.
 */
function assertValidScope(scope: string): void {
  if (scope.includes("@")) {
    throw new Error(`Invalid rate-limit scope "${scope}": scopes must not contain "@" (reserved for real emails)`);
  }
}

export async function isScopeRateLimited(
  scope: string,
  ipAddress: string,
  maxAttempts: number = DEFAULT_SCOPE_MAX_ATTEMPTS_PER_IP,
  windowMs: number = DEFAULT_SCOPE_WINDOW_MS
): Promise<boolean> {
  assertValidScope(scope);
  const since = new Date(Date.now() - windowMs);
  const count = await prisma.loginAttempt.count({
    where: { email: scope, ipAddress, createdAt: { gte: since } },
  });
  return count >= maxAttempts;
}

/** Records one attempt against `scope`+`ipAddress` and prunes anything old enough that no caller's window could still read it — a scope with no other cleanup would otherwise only ever grow this table. */
export async function recordScopeAttempt(scope: string, ipAddress: string): Promise<void> {
  assertValidScope(scope);
  await prisma.loginAttempt.create({ data: { email: scope, ipAddress, succeeded: true } });
  await prisma.loginAttempt.deleteMany({
    where: { email: scope, ipAddress, createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
}
