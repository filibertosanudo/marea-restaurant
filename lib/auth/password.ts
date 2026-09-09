import { hash, verify } from "@node-rs/argon2";

// Algorithm.Argon2id — inlined because `isolatedModules` forbids reading
// values off @node-rs/argon2's ambient `const enum` at the type level; the
// runtime export is a real object (`Algorithm.Argon2id === 2`), this is
// purely a TS restriction on cross-module const enum access.
const ARGON2ID = 2;

// A precomputed argon2id hash of a value nobody will ever type, used to keep
// a verify() call's timing identical whether a real hash exists or not —
// shared by every caller that must not leak, via response time, whether a
// user or a passwordHash exists.
export const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzYWx0c2FsdA$K2f3f6vX2sVh8m2b8QhZbA1lM2z3vqk1uV1H4rQxYqM";

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
