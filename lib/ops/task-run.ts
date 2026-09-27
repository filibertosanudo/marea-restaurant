import type pg from "pg";

export type TaskResult = { processed?: number | bigint; detail?: string };
export type TaskOutcome = "succeeded" | "skipped-done" | "skipped-locked";

type Options = {
  task: string;
  /** The window the run answers for. (task, slot) is unique among successes: a second run in the same window does nothing. */
  slot: string;
  /** Pinged with GET after a success. A failure pings nothing: the monitor alerts on the silence. */
  monitorUrl?: string;
  execute: () => Promise<TaskResult>;
};

const PING_TIMEOUT_MS = 10_000;
const DETAIL_MAX = 2_000;

/**
 * The frame every scheduled task runs in. It gives each one the same four
 * properties, so no task has to remember them: one run at a time (an advisory
 * lock, released with the connection even if the process dies), idempotent per
 * window (a slot that already succeeded is skipped), a row in OpsTaskRun for
 * when it ran and how it ended, and a dead man's switch (the monitor is told
 * about successes only).
 *
 * `client` is connected by the caller with the role the task needs; this file
 * never picks a connection string.
 */
export async function runTask(client: pg.Client, options: Options): Promise<TaskOutcome> {
  const { task, slot, monitorUrl, execute } = options;

  const lock = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [
    `marea.ops.${task}`,
  ]);
  if (!lock.rows[0]?.locked) return "skipped-locked";

  try {
    const claimed = await client.query(
      `INSERT INTO "OpsTaskRun" (id, task, slot, status, "startedAt")
       VALUES (gen_random_uuid()::text, $1, $2, 'RUNNING', now())
       ON CONFLICT (task, slot) DO UPDATE
         SET status = 'RUNNING', "startedAt" = now(), "finishedAt" = NULL, detail = NULL, processed = NULL
         WHERE "OpsTaskRun".status <> 'SUCCEEDED'
       RETURNING id`,
      [task, slot]
    );
    if (claimed.rowCount === 0) return "skipped-done";
    const runId = claimed.rows[0].id as string;

    let result: TaskResult;
    try {
      result = await execute();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await client.query(`UPDATE "OpsTaskRun" SET status = 'FAILED', "finishedAt" = now(), detail = $2 WHERE id = $1`, [
        runId,
        message.slice(0, DETAIL_MAX),
      ]);
      throw err;
    }

    await client.query(
      `UPDATE "OpsTaskRun" SET status = 'SUCCEEDED', "finishedAt" = now(), processed = $2, detail = $3 WHERE id = $1`,
      [runId, result.processed === undefined ? null : String(result.processed), result.detail?.slice(0, DETAIL_MAX) ?? null]
    );
    if (monitorUrl) await ping(monitorUrl);
    return "succeeded";
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [`marea.ops.${task}`]).catch(() => undefined);
  }
}

/** A monitor that is down must not turn a good run into a failed one; the missing ping is what alerts. */
async function ping(url: string): Promise<void> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
    if (!response.ok) console.warn(`[ops] monitor answered ${response.status}`);
  } catch (err) {
    console.warn(`[ops] monitor ping failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
