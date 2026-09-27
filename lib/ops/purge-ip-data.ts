import "server-only";
import { prisma } from "@/lib/prisma";

/** Both store IP addresses, personal data under the LFPDPPP. Purely a retention limit, no judgment call — see docs/aviso-de-privacidad.md. */
export const IP_DATA_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export type IpDataCounts = { loginAttempts: number; rateLimitCounters: number; cutoff: Date };

/**
 * Deletes (or, with `dryRun`, counts) LoginAttempt and RateLimitCounter rows
 * older than the retention window. RateLimitCounter is already kept far
 * leaner than this by purgeRateLimits (24h, for query performance); this
 * function's own cutoff on that table is a no-op in practice but applied
 * explicitly so the retention limit doesn't depend on a second task's
 * unrelated schedule.
 */
export async function purgeOldIpData(now: Date, dryRun: boolean): Promise<IpDataCounts> {
  const cutoff = new Date(now.getTime() - IP_DATA_RETENTION_MS);
  if (dryRun) {
    const [loginAttempts, rateLimitCounters] = await Promise.all([
      prisma.loginAttempt.count({ where: { createdAt: { lt: cutoff } } }),
      prisma.rateLimitCounter.count({ where: { createdAt: { lt: cutoff } } }),
    ]);
    return { loginAttempts, rateLimitCounters, cutoff };
  }
  const [loginAttempts, rateLimitCounters] = await Promise.all([
    prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.rateLimitCounter.deleteMany({ where: { createdAt: { lt: cutoff } } }),
  ]);
  return { loginAttempts: loginAttempts.count, rateLimitCounters: rateLimitCounters.count, cutoff };
}
