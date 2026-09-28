import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { findRoleProblem } from "../db/role-check";
import type { PrismaClient } from "../generated/prisma/client";

export type VerifyReport = {
  migrations: { applied: number; pending: string[]; unfinished: string[]; unknown: string[] };
  /** Rows the owner sees against rows marea_app sees inside each business, per table with row level security. */
  rls: { table: string; ownerRows: number; appRows: number }[];
  /** What the application sees with no business set: must be nothing. */
  appRowsWithoutBusiness: number;
  roleProblem: string | null;
  media: { referenced: number; missing: string[] };
  problems: string[];
};

const MEDIA_PATH = "/api/media/";

/**
 * Row level security scopes every other table to exactly one business, so
 * summing what marea_app sees across every business always equals the
 * owner's total — a row can't be double-counted if only one business can
 * ever see it. Organization breaks that on purpose (module 19): a chain's
 * organization is visible from every one of its own businesses, so the sum
 * over-counts it by however many businesses share it. Counted by distinct
 * id instead, for this table only — the general sum stays a cheap
 * count(*) per table per business, not a full id scan, for every table
 * that doesn't need the exception.
 */
const SHARED_ACROSS_BUSINESSES_TABLES = new Set(["Organization"]);

type VerifyInput = {
  ownerUrl: string;
  appUrl: string;
  /** The repository's prisma/migrations: what this code expects to be applied. */
  migrationsDir: string;
  /** Where the restored media folder is, when the backup carried one. */
  mediaDir?: string;
};

async function withClient<T>(url: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/**
 * Answers the two different questions a restore raises. As the owner: is the
 * data there (migrations, row counts, media). As marea_app inside each
 * business: can the application actually read it. A restore only the owner
 * can read is not one that serves anybody, and only the second connection
 * finds that out.
 */
export async function verifyRestore(input: VerifyInput): Promise<VerifyReport> {
  const problems: string[] = [];

  const { migrations, rlsTables, businessIds, mediaKeys, ownerCounts } = await withClient(input.ownerUrl, async (owner) => {
    const applied = await owner.query<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>(
      "SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations"
    );
    const expected = (await readdir(input.migrationsDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
    const finished = new Set(applied.rows.filter((r) => r.finished_at && !r.rolled_back_at).map((r) => r.migration_name));
    const migrations = {
      applied: finished.size,
      pending: expected.filter((name) => !finished.has(name)).sort(),
      unfinished: applied.rows.filter((r) => !r.finished_at || r.rolled_back_at).map((r) => r.migration_name),
      unknown: [...finished].filter((name) => !expected.includes(name)).sort(),
    };

    const tables = (
      await owner.query<{ relname: string }>(
        "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity ORDER BY 1"
      )
    ).rows.map((r) => r.relname);
    const ownerCounts = new Map<string, number>();
    for (const table of tables) {
      const { rows } = await owner.query<{ n: string }>(`SELECT count(*) AS n FROM "${table}"`);
      ownerCounts.set(table, Number(rows[0].n));
    }
    const businessIds = (await owner.query<{ id: string }>('SELECT id FROM "Business" ORDER BY id')).rows.map((r) => r.id);

    // Every uploaded image the database points at. Static assets shipped with the
    // app (/menu/...) are not media and are not looked for here.
    const columns = await owner.query<{ table_name: string; column_name: string }>(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'imageUrl'"
    );
    const mediaKeys = new Set<string>();
    for (const { table_name, column_name } of columns.rows) {
      const { rows } = await owner.query<{ url: string }>(`SELECT "${column_name}" AS url FROM "${table_name}" WHERE "${column_name}" LIKE '%${MEDIA_PATH}%'`);
      for (const { url } of rows) mediaKeys.add(url.slice(url.indexOf(MEDIA_PATH) + MEDIA_PATH.length));
    }
    return { migrations, rlsTables: tables, businessIds, mediaKeys, ownerCounts };
  });

  if (migrations.unfinished.length) problems.push(`migrations not finished or rolled back: ${migrations.unfinished.join(", ")}`);
  if (migrations.unknown.length) problems.push(`applied migrations this code does not have: ${migrations.unknown.join(", ")}`);

  const { rls, appRowsWithoutBusiness, roleProblem } = await withClient(input.appUrl, async (app) => {
    const roleProblem = await findRoleProblem({
      $queryRaw: async (strings: TemplateStringsArray) => (await app.query(strings.join(""))).rows,
    } as unknown as Pick<PrismaClient, "$queryRaw">);

    const count = async (table: string) => Number((await app.query<{ n: string }>(`SELECT count(*) AS n FROM "${table}"`)).rows[0].n);
    const ids = async (table: string) => (await app.query<{ id: string }>(`SELECT id FROM "${table}"`)).rows.map((r) => r.id);

    await app.query("SELECT set_config('app.business_id', '', false)");
    let appRowsWithoutBusiness = 0;
    for (const table of rlsTables) appRowsWithoutBusiness += await count(table);

    const summed = new Map<string, number>();
    const distinctIds = new Map<string, Set<string>>();
    for (const id of businessIds) {
      await app.query("SELECT set_config('app.business_id', $1, false)", [id]);
      for (const table of rlsTables) {
        if (SHARED_ACROSS_BUSINESSES_TABLES.has(table)) {
          const set = distinctIds.get(table) ?? new Set<string>();
          for (const rowId of await ids(table)) set.add(rowId);
          distinctIds.set(table, set);
        } else {
          summed.set(table, (summed.get(table) ?? 0) + (await count(table)));
        }
      }
    }
    return {
      rls: rlsTables.map((table) => ({
        table,
        ownerRows: ownerCounts.get(table) ?? 0,
        appRows: SHARED_ACROSS_BUSINESSES_TABLES.has(table) ? (distinctIds.get(table)?.size ?? 0) : (summed.get(table) ?? 0),
      })),
      appRowsWithoutBusiness,
      roleProblem,
    };
  });

  if (roleProblem) problems.push(`the application would refuse to start: it ${roleProblem}`);
  if (appRowsWithoutBusiness > 0) problems.push(`marea_app sees ${appRowsWithoutBusiness} rows with no business set: row level security is not in effect`);
  if (rls.every((t) => t.ownerRows === 0)) problems.push("the restored database has no rows in any table with row level security");
  for (const t of rls) {
    if (t.appRows !== t.ownerRows) problems.push(`${t.table}: the owner sees ${t.ownerRows} rows, marea_app sees ${t.appRows} across the businesses`);
  }

  const missing: string[] = [];
  if (mediaKeys.size > 0) {
    if (!input.mediaDir) problems.push(`${mediaKeys.size} uploaded images are referenced but the backup has no media archive`);
    else for (const key of mediaKeys) if (!existsSync(join(input.mediaDir, key))) missing.push(key);
  }
  if (missing.length) problems.push(`${missing.length} referenced media files are missing from the restored folder: ${missing.slice(0, 5).join(", ")}`);

  return { migrations, rls, appRowsWithoutBusiness, roleProblem, media: { referenced: mediaKeys.size, missing }, problems };
}
