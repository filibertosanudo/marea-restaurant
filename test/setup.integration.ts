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

ensureSchemaReady();

beforeEach(async () => {
  await resetDb();
  clearTestSession();
});
