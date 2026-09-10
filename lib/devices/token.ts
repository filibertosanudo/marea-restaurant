import "server-only";
import { createHash, randomBytes } from "crypto";

/**
 * Same reasoning as lib/auth/reset-token.ts: a 256-bit CSPRNG secret has no
 * low-entropy guesses to slow down, so sha256 and a plain unique-index
 * lookup are correct — no need for argon2's per-row verify() loop. Unlike a
 * reset token this one is long-lived and sent on every poll, so there is no
 * expiry here; only rotation, which is just overwriting the hash.
 */
export function generateDeviceToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashDeviceToken(token) };
}

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
