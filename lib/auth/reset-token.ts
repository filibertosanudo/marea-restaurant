import "server-only";
import { createHash, randomBytes } from "crypto";

export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

/**
 * The raw token only ever exists in the emailed link and the requester's
 * browser. sha256 (not argon2/bcrypt) is the right hash here — unlike a
 * password, this is a single-use, 256-bit CSPRNG value with no low-entropy
 * guesses to slow down; a fast hash is fine and lets lookup stay a plain
 * unique-index query instead of a per-row verify() loop.
 */
export function generateResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashResetToken(token) };
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
