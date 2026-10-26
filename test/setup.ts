import { afterAll } from "vitest";

// Minimal env so importing lib/env (required by any server-only module under
// test) doesn't fail parsing in a unit test that never touches a real
// deployment's configuration. Real values always win if already set.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.AUTH_SECRET ??= "test-secret";

// A test file that sets a variable for itself (BUSINESS_ROOT_DOMAIN, AUTH_URL,
// ...) must not leave it to the next file the same worker runs: modules are
// evaluated again for every file, process.env is not, so a leftover value made
// unrelated tests pass or fail depending on file order. Taken after the
// defaults above, which every file keeps.
const envAtStart = { ...process.env };
afterAll(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in envAtStart)) delete process.env[key];
  }
  Object.assign(process.env, envAtStart);
});
