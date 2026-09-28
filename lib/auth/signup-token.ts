import "server-only";
import { createHash, randomBytes } from "crypto";

// Long enough that a signup left overnight still verifies the next morning;
// short enough that the cleanup task (lib/ops/purge-unverified-signups.ts)
// frees an abandoned slug within a couple of days, not indefinitely.
export const SIGNUP_VERIFICATION_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

/**
 * Same shape as lib/auth/reset-token.ts's generateResetToken(), on purpose —
 * this is exactly as sensitive a secret (it proves the holder controls the
 * address, and unlocks the admin panel the moment it's used), so it gets
 * the same treatment: a single-use, 256-bit CSPRNG value that only ever
 * exists in the emailed link and the browser that opens it, hashed at rest
 * with a fast hash (no low-entropy guesses to slow down, unlike a password).
 */
export function generateVerificationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashVerificationToken(token) };
}

export function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
