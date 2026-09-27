import "server-only";
import pg from "pg";
import { env } from "@/lib/env";
import { runTask, type TaskOutcome, type TaskResult } from "./task-run";

export type SlotGranularity = "hourly" | "daily" | "monthly";

/** The window `now` falls in, at the given granularity, in UTC — what makes two runs in the same window a no-op. */
export function slotFor(granularity: SlotGranularity, now = new Date()): string {
  const iso = now.toISOString();
  if (granularity === "hourly") return iso.slice(0, 13); // YYYY-MM-DDTHH
  if (granularity === "daily") return iso.slice(0, 10); // YYYY-MM-DD
  return iso.slice(0, 7); // YYYY-MM
}

/**
 * Runs a maintenance script's real work inside the shared OpsTaskRun frame
 * (advisory lock, one success per window, a row per run, a monitor pinged
 * only on success — see task-run.ts). Connected as the application's own
 * role, marea_app: none of these tasks is the backup, so none needs the
 * owner's connection (see AGENTS.md's note on the maintenance scripts).
 *
 * Opens and closes its own bookkeeping connection rather than reusing
 * `prisma`: these are one-shot CLI invocations, not a long-lived service, so
 * a second short-lived connection per run costs nothing, and task-run.ts
 * only needs a plain `pg.Client`.
 */
export async function runScheduled(
  task: string,
  granularity: SlotGranularity,
  monitorUrl: string | undefined,
  execute: () => Promise<TaskResult>
): Promise<TaskOutcome> {
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    return await runTask(client, { task, slot: slotFor(granularity), monitorUrl, execute });
  } finally {
    await client.end();
  }
}
