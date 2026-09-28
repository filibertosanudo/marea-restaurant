import "server-only";
import { prisma } from "@/lib/prisma";
import { SIGNUP_VERIFICATION_TOKEN_TTL_MS } from "@/lib/auth/signup-token";
import { listUnverifiedSignups, purgeUnverifiedSignup } from "@/lib/tenants/verification";

/**
 * A signup nobody verified within its own token's lifetime frees its slug
 * for the real restaurant that might want it (module 19, phase 3) — same
 * cutoff as the token itself, not a second number to keep in sync with it.
 */
export const UNVERIFIED_SIGNUP_RETENTION_MS = SIGNUP_VERIFICATION_TOKEN_TTL_MS;

export type UnverifiedSignupCounts = { candidates: number; purged: number; cutoff: Date };

/**
 * Deletes (or, with `dryRun`, only counts) organizations whose signup was
 * never verified. Each candidate is re-checked by marea_purge_unverified_signup
 * itself at delete time — a candidate this function read a moment before
 * someone finally verified it is left alone, not purged out from under them.
 */
export async function purgeUnverifiedSignups(now: Date, dryRun: boolean): Promise<UnverifiedSignupCounts> {
  const cutoff = new Date(now.getTime() - UNVERIFIED_SIGNUP_RETENTION_MS);
  const candidates = await listUnverifiedSignups(prisma, cutoff);
  if (dryRun) {
    return { candidates: candidates.length, purged: 0, cutoff };
  }

  let purged = 0;
  for (const candidate of candidates) {
    if (await purgeUnverifiedSignup(prisma, candidate)) purged += 1;
  }
  return { candidates: candidates.length, purged, cutoff };
}
