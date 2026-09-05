// Stand-in for the root auth.ts (the NextAuth config) in integration
// tests — lib/auth/actions.ts imports signIn/signOut/auth from it
// directly. The real file pulls in next-auth's main entry, which eagerly
// touches next/server as part of its own env checks and can't load
// outside a real Next.js runtime; mocked here instead of testing NextAuth
// itself, which isn't this suite's job.
import { vi } from "vitest";

export const authMock = {
  signIn: vi.fn(),
  signOut: vi.fn(),
  auth: vi.fn(),
  // app/api/auth/[...nextauth]/route.ts destructures GET/POST off this —
  // no current *.integration.test.ts imports that route, but the shape
  // should match every @/auth call site, not just the ones exercised today.
  handlers: { GET: vi.fn(), POST: vi.fn() },
};
