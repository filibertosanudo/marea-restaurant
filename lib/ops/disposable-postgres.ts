import { randomBytes } from "node:crypto";
import pg from "pg";
import { run } from "./exec";

export const RESTORE_TEST_LABEL = "marea.ops.restore-test";

export type DisposablePostgres = {
  runId: string;
  /** Owner-role connection to the maintenance database. */
  adminUrl: string;
  remove: () => Promise<void>;
};

/**
 * The only database a restore test ever connects to: one it starts itself, on
 * a bridge address with no published port, and removes afterwards. There is no
 * setting that points it at anything else, on purpose: a script that takes its
 * target from a variable is one stale variable from restoring over production
 * at 4 a.m. Before anything is written, `assertDisposable` proves the server
 * answering is the one started with this run's id.
 */
export async function startDisposablePostgres(options: { image: string; owner: string }): Promise<DisposablePostgres> {
  const runId = randomBytes(8).toString("hex");
  const password = randomBytes(18).toString("base64url");
  const name = `marea-restore-test-${runId}`;
  await run("docker", [
    "run", "--detach", "--rm",
    "--name", name,
    "--label", `${RESTORE_TEST_LABEL}=${runId}`,
    "--env", `POSTGRES_USER=${options.owner}`,
    "--env", `POSTGRES_PASSWORD=${password}`,
    "--env", "POSTGRES_DB=postgres",
    options.image,
    "-c", `marea.restore_test=${runId}`,
  ]);
  const remove = async () => {
    await run("docker", ["rm", "--force", name]).catch(() => undefined);
  };

  try {
    const host = (await run("docker", ["inspect", "--format", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", name])).trim();
    if (!host) throw new Error("the disposable database has no address");
    const adminUrl = `postgresql://${encodeURIComponent(options.owner)}:${encodeURIComponent(password)}@${host}:5432/postgres`;
    await waitUntilReady(adminUrl);
    await assertDisposable(adminUrl, runId);
    return { runId, adminUrl, remove };
  } catch (err) {
    await remove();
    throw err;
  }
}

async function waitUntilReady(url: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const client = new pg.Client({ connectionString: url });
    try {
      await client.connect();
      await client.query("SELECT 1");
      return;
    } catch (err) {
      if (Date.now() > deadline) throw new Error(`the disposable database did not come up: ${err instanceof Error ? err.message : String(err)}`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
      await client.end().catch(() => undefined);
    }
  }
}

/** Refuses any server that was not started by this run: the id was given to it on its command line. */
export async function assertDisposable(url: string, runId: string): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ v: string | null }>("SELECT current_setting('marea.restore_test', true) AS v");
    if (rows[0]?.v !== runId) throw new Error("refusing to restore: this database was not started by this restore test");
  } finally {
    await client.end();
  }
}
