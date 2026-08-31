import "server-only";
import { prisma } from "@/lib/prisma";

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
 * Best-effort client IP from standard proxy headers (Vercel and most
 * reverse proxies set x-forwarded-for). Falls back to a fixed key so the
 * per-IP limit still applies (conservatively, shared by everyone behind an
 * unknown proxy) instead of silently no-op'ing.
 *
 * Takes anything with a `.get(name)` reader rather than a full `Request` —
 * a Route Handler has `request.headers`, but a Server Action or Server
 * Component only has next/headers()'s return value, which has no `request`
 * wrapping it. Both satisfy this shape.
 *
 * Trust boundary: this only resolves the real client IP when the
 * reverse proxy in front of the app sets (and doesn't just append to)
 * x-forwarded-for — true on Vercel. If this app is ever exposed directly
 * or behind a proxy that forwards the header as-is, a caller can spoof it
 * and evade the per-IP limit; the per-email limit above is unaffected by
 * that and remains the primary defense there.
 */
export function getClientIp(headers: { get(name: string): string | null }): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
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
 */
export async function isScopeRateLimited(
  scope: string,
  ipAddress: string,
  maxAttempts: number = DEFAULT_SCOPE_MAX_ATTEMPTS_PER_IP,
  windowMs: number = DEFAULT_SCOPE_WINDOW_MS
): Promise<boolean> {
  const since = new Date(Date.now() - windowMs);
  const count = await prisma.loginAttempt.count({
    where: { email: scope, ipAddress, createdAt: { gte: since } },
  });
  return count >= maxAttempts;
}

/** Records one attempt against `scope`+`ipAddress` and prunes anything old enough that no caller's window could still read it — a scope with no other cleanup would otherwise only ever grow this table. */
export async function recordScopeAttempt(scope: string, ipAddress: string): Promise<void> {
  await prisma.loginAttempt.create({ data: { email: scope, ipAddress, succeeded: true } });
  await prisma.loginAttempt.deleteMany({
    where: { email: scope, ipAddress, createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
}
