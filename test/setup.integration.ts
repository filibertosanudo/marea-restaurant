import { beforeEach, vi } from "vitest";
import { ensureSchemaReady, resetDb } from "./db";
import { clearTestSession } from "./stubs/auth-session";

// There's no live Next.js request to back either of these outside one —
// see the stubs' own header comments. vi.mock (not a static resolve.alias)
// because @/lib/auth/session collides with the broader "@" path alias
// otherwise: whichever of the two vitest checks first wins, and there's no
// way to guarantee this one does.
vi.mock("next/headers", async () => import("./stubs/next-headers"));
vi.mock("@/lib/auth/session", async () => import("./stubs/auth-session"));
// Same reasoning, for the root NextAuth config: lib/auth/actions.ts
// imports signIn/signOut/auth straight from it, and the real file pulls
// in next-auth's own next/server dependency.
vi.mock("@/auth", async () => import("./stubs/auth-config").then((m) => m.authMock));
// lib/auth/actions.ts also imports AuthError from the "next-auth" package
// root directly (not @/auth) — that package's own entry point is what
// actually pulls in next/server, regardless of the mock above. Re-exports
// the real class from @auth/core (the framework-agnostic package
// next-auth wraps), so `instanceof AuthError` in the code under test still
// works against errors this suite throws.
vi.mock("next-auth", async () => {
  const { AuthError } = await import("@auth/core/errors");
  return { AuthError };
});
// Every Server Action in lib/**/*-actions.ts calls this after its mutation
// to invalidate the admin panel's cache — irrelevant to what these tests
// assert, and there's no cache to invalidate outside a real request either.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// redirect() throws a special control-flow error Next's own rendering
// layer catches — outside a real request there's nothing to catch it, so
// tests that exercise a redirecting action need to assert against this
// thrown value instead of a return value.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

// Integration tests run against a real Postgres instance — unlike the unit
// project's setup.ts, there is no placeholder fallback here. A missing
// DATABASE_URL must fail loudly as a misconfigured test run, not silently
// resolve against a database that doesn't exist and read as a connection
// error instead of what it actually is.
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is required to run integration tests — point it at a real Postgres instance."
  );
}

// Each vitest worker's pool opens its own connections; a lower cap here
// keeps several parallel workers from adding up past Postgres's default
// max_connections. Real values (set by the app or CI) always win.
process.env.DATABASE_POOL_MAX ??= "5";

// Never used to make a real authenticated call — every test that touches
// lib/stripe/client.ts's `stripe` mocks the specific network-calling
// method it needs (stripe.refunds.create, stripe.refunds.list, ...). Still
// required: the SDK now refuses to even construct a client with an empty
// key, and that construction happens the moment anything accesses
// `stripe.<anything>`, mocked or not.
process.env.STRIPE_SECRET_KEY ??= "sk_test_placeholder";

ensureSchemaReady();

beforeEach(async () => {
  await resetDb();
  clearTestSession();
});
