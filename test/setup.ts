// Minimal env so importing lib/env (required by any server-only module under
// test) doesn't fail parsing in a unit test that never touches a real
// deployment's configuration. Real values always win if already set.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.AUTH_SECRET ??= "test-secret";
