/**
 * Gives the two application roles a login and a password. The migration that
 * enables row level security creates marea_app and marea_worker without
 * either, so that no password ever lives in a migration; this sets them from
 * the environment. Run as the database owner, after `prisma migrate deploy`,
 * and safe to run again (it is how a password is rotated).
 *
 *   APP_DB_PASSWORD=... WORKER_DB_PASSWORD=... npm run db:provision-roles
 *
 * Connects with DIRECT_URL, else DATABASE_URL: the owner's, never the app's.
 */
import "dotenv/config";
import pg from "pg";

const ROLES = [
  { role: "marea_app", variable: "APP_DB_PASSWORD" },
  { role: "marea_worker", variable: "WORKER_DB_PASSWORD" },
] as const;

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL or DATABASE_URL must point at the database owner.");

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    for (const { role, variable } of ROLES) {
      const password = process.env[variable];
      if (!password) throw new Error(`${variable} is required.`);
      // format() quotes the identifier and the literal; ALTER ROLE itself
      // cannot take a bind parameter.
      const { rows } = await client.query<{ sql: string }>(
        "SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', $1::text, $2::text) AS sql",
        [role, password]
      );
      await client.query(rows[0].sql);
      console.log(`${role}: login enabled, password set from ${variable}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
