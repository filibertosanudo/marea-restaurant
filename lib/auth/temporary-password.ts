import { randomBytes } from "node:crypto";

/**
 * Not meant to be memorable: whoever creates an account hands it over once and
 * the person changes it on first sign-in (mustChangePassword). Excludes
 * visually ambiguous characters (0/O, 1/l/I). Shared by the team screen and
 * the tenant provisioning script (lib/tenants/provision.ts).
 */
export function generateTemporaryPassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return `${out}!`;
}
