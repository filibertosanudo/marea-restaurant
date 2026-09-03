/** `new URL(value).hostname`, or null for anything that doesn't parse — no "server-only" import, so both the app (lib/env.ts) and standalone scripts (prisma/seed.ts) can share it. */
export function safeHostname(value: string): string | null {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}
