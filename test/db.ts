// Integration test isolation: each vitest worker gets its own Postgres
// schema, migrated once and truncated between tests. Real transactions and
// real row locks (this project leans on `$transaction` and `FOR UPDATE`,
// plus the `reservation_no_overlap` EXCLUDE constraint) only behave like
// production inside an actual schema — a rolled-back wrapper transaction
// can't reproduce two connections racing for the same lock, which is
// exactly what several of this module's tests need to prove.
import { execFileSync } from "node:child_process";
import { createId } from "@paralleldrive/cuid2";
import { prisma } from "@/lib/prisma";

// Random, not derived from VITEST_POOL_ID: a worker slot freeing up and a
// new one spinning up to reuse the same pool id, while the previous
// holder's Prisma pool hadn't finished disconnecting yet, was enough to
// let two files' queries land on the same "test_worker_N" schema at once
// — this schema name is unique per test file's own module evaluation
// (fresh every time thanks to vitest's per-file isolation) regardless of
// which worker or pool id ends up running it.
export const testSchema = `test_${createId()}`;

// Two independent things need to agree on the schema, for two different
// reasons:
//   - `schema` in the URL: what the Prisma CLI's migration engine reads to
//     create and migrate a named schema.
//   - `options=-c search_path=...` in the URL: several production code
//     paths (create-order, board-actions, refund-actions, ...) take a row
//     lock with a raw `$queryRaw ... FOR UPDATE`, and raw SQL isn't
//     rewritten by the query builder — it resolves unqualified table names
//     through Postgres's own search_path, same as any other client.
//   - DATABASE_SCHEMA (set below, read by lib/prisma.ts): the generated
//     client's own *structured* queries (`prisma.menuItem.update(...)`)
//     are qualified by @prisma/adapter-pg's `schema` option instead —
//     confirmed by hitting the opposite failure mode, "public.Business
//     does not exist", with search_path already correctly set and only
//     this option missing.
function withSchema(baseUrl: string, schema: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("schema", schema);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return url.toString();
}

/**
 * Migrates this worker's schema and points DATABASE_URL/DIRECT_URL/
 * DATABASE_SCHEMA at it for the rest of the process. Runs once per
 * integration test file (vitest's default pool gives each file its own
 * process, so a flag can't skip this across files the way it could
 * across tests within one) — cheap either way, since `prisma migrate
 * deploy` no-ops once the schema is already up to date.
 */
export function ensureSchemaReady(): void {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error("DATABASE_URL must be set before ensureSchemaReady() runs.");
  }
  const scopedUrl = withSchema(baseUrl, testSchema);

  // shell: true so this resolves npx.cmd on Windows the same way it
  // resolves the plain npx script on Linux CI — execFileSync alone doesn't
  // go through a shell and can't apply either platform's PATH extension
  // rules on its own.
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: scopedUrl, DIRECT_URL: scopedUrl },
    stdio: "inherit",
    shell: true,
  });

  process.env.DATABASE_URL = scopedUrl;
  process.env.DIRECT_URL = scopedUrl;
  process.env.DATABASE_SCHEMA = testSchema;
}

/**
 * Drops this file's own throwaway schema once its tests are done — the
 * one thing the per-file random name (see `testSchema` above) needs that
 * the old `test_worker_N` scheme didn't: without this, every integration
 * test file leaves an orphaned schema behind on whatever Postgres the
 * suite ran against, unbounded run over run. Called from a single
 * `afterAll` in test/setup.integration.ts, not per-test — this schema is
 * shared by every test in the file.
 */
export async function dropSchema(): Promise<void> {
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
}

/**
 * Empties every table in this worker's schema. Call between tests, not
 * between files — tests within a file share the schema and must not share
 * rows.
 *
 * Raw queries aren't schema-qualified the way the generated client's own
 * queries are (that qualification is the query builder's job, not the
 * connection's) — every reference here names `testSchema` explicitly
 * rather than relying on the connection's default search_path.
 */
export async function resetDb(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = ${testSchema}
  `;
  const names = tables
    .map((t) => t.tablename)
    .filter((name) => name !== "_prisma_migrations")
    .map((name) => `"${testSchema}"."${name}"`);
  if (names.length === 0) return;
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names.join(", ")} RESTART IDENTITY CASCADE`);
}
