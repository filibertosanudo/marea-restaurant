/**
 * Pure comparison used by auth.ts's `jwt` callback. Kept separate and
 * dependency-free so it can be unit tested directly — the callback itself
 * can't run outside a real Next.js runtime (see test/stubs/auth-config.ts).
 *
 * token.iat is seconds since epoch (JWT spec); passwordChangedAt is a JS
 * Date (milliseconds) — the one-line unit mistake here silently keeps every
 * session alive across a password change.
 */
export function isRevokedByPasswordChange(passwordChangedAt: Date | null | undefined, tokenIat: number | undefined): boolean {
  if (!passwordChangedAt || !tokenIat) return false;
  return passwordChangedAt.getTime() > tokenIat * 1000;
}
