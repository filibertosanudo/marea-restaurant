import { hash, verify } from "@node-rs/argon2";

// Algorithm.Argon2id — inlined because `isolatedModules` forbids reading
// values off @node-rs/argon2's ambient `const enum` at the type level; the
// runtime export is a real object (`Algorithm.Argon2id === 2`), this is
// purely a TS restriction on cross-module const enum access.
const ARGON2ID = 2;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, { algorithm: ARGON2ID });
}

export async function verifyPassword(
  hashValue: string,
  plain: string
): Promise<boolean> {
  try {
    return await verify(hashValue, plain);
  } catch {
    return false;
  }
}
