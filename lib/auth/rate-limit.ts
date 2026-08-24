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
  // A correct password proves the account owner is behind the wheel, so a
  // few earlier typos (from them or a colleague on the same shared login)
  // shouldn't still count against them for the rest of the 15-minute
  // window. Cleared by email only, regardless of which IP they're on now.
  if (succeeded) {
    await prisma.loginAttempt.deleteMany({
      where: { email: normalizeEmail(email), succeeded: false },
    });
  }
}

/**
 * Best-effort client IP from standard proxy headers (Vercel and most
 * reverse proxies set x-forwarded-for). Falls back to a fixed key so the
 * per-IP limit still applies (conservatively, shared by everyone behind an
 * unknown proxy) instead of silently no-op'ing.
 *
 * Trust boundary: this only resolves the real client IP when the
 * reverse proxy in front of the app sets (and doesn't just append to)
 * x-forwarded-for — true on Vercel. If this app is ever exposed directly
 * or behind a proxy that forwards the header as-is, a caller can spoof it
 * and evade the per-IP limit; the per-email limit below is unaffected by
 * that and remains the primary defense.
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
