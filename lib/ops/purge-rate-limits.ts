import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * A fixed margin well past the longest window any scope uses today
 * (password:reset's 60 minutes); a scope with a longer window later just
 * needs this constant raised, not a per-scope schedule.
 */
export const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000;

export type RateLimitPurgeResult = { count: number; cutoff: Date };

/** Deletes (or, with `dryRun`, counts) RateLimitCounter rows old enough that no caller's window could still read them. Nothing purges this table on its own — every write is a plain insert (lib/auth/rate-limit.ts) — so without this it only grows. */
export async function purgeRateLimits(now: Date, dryRun: boolean): Promise<RateLimitPurgeResult> {
  const cutoff = new Date(now.getTime() - RATE_LIMIT_RETENTION_MS);
  if (dryRun) {
    const count = await prisma.rateLimitCounter.count({ where: { createdAt: { lt: cutoff } } });
    return { count, cutoff };
  }
  const { count } = await prisma.rateLimitCounter.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return { count, cutoff };
}
