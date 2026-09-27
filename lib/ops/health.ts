import "server-only";
import { prisma } from "@/lib/prisma";
import { systemPrisma } from "@/lib/db/system";
import { BACKUP_TASK } from "./backup";

export type HealthCheck = { name: string; ok: boolean; detail: string };
export type HealthReport = { ok: boolean; checks: HealthCheck[] };

/**
 * The worker writes this every loop tick, whether or not it claimed
 * anything (scripts/worker.ts) — the one thing this check needs from a
 * process that otherwise never talks back. 60s is twelve times its own
 * 5s poll interval: generous against a GC pause or a slow database round
 * trip, tight enough that a genuinely dead worker is caught within a
 * minute, not scattered across several poll cycles' worth of silence.
 */
export const WORKER_HEARTBEAT_MAX_AGE_MS = 60_000;

/**
 * Jobs are claimed every ~5s, in batches of 20 (lib/notifications/queue.ts,
 * scripts/worker.ts) — a due job unclaimed for two full minutes means
 * nothing is claiming, not that the queue is merely busy. Measured against
 * the oldest QUEUED job whose own runAfter has already passed, never
 * against createdAt: a job can sit QUEUED for up to an hour by design
 * (backoffMs's own cap) while it waits for its next retry, and that is not
 * a stuck queue.
 */
export const QUEUE_BACKLOG_MAX_AGE_MS = 2 * 60_000;

/**
 * Backups run every six hours (lib/ops/backup-policy.ts's sixhourly tier).
 * Eight hours is that plus one missed window's worth of slack — long
 * enough that a scheduler tick landing a few minutes late never pages
 * anyone, short enough that a backup silently stopped for a whole day
 * never goes unnoticed until the monthly restore test finds it.
 */
export const BACKUP_MAX_AGE_MS = 8 * 60 * 60 * 1000;

const WORKER_HEARTBEAT_ID = "worker";

/** Called once per loop tick by scripts/worker.ts. */
export async function writeWorkerHeartbeat(now = new Date()): Promise<void> {
  await prisma.workerHeartbeat.upsert({
    where: { id: WORKER_HEARTBEAT_ID },
    create: { id: WORKER_HEARTBEAT_ID, updatedAt: now },
    update: { updatedAt: now },
  });
}

async function checkDatabase(): Promise<HealthCheck> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { name: "database", ok: true, detail: "reachable" };
  } catch (err) {
    return { name: "database", ok: false, detail: `unreachable: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Every check after the first queries the database too — this wraps each one so a database outage is reported by all four as a failure, never as an unhandled rejection. */
async function guarded(name: string, run: () => Promise<HealthCheck>): Promise<HealthCheck> {
  try {
    return await run();
  } catch (err) {
    return { name, ok: false, detail: `check failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function checkWorkerHeartbeat(now: Date): Promise<HealthCheck> {
  return guarded("worker", async () => {
    const row = await prisma.workerHeartbeat.findUnique({ where: { id: WORKER_HEARTBEAT_ID } });
    if (!row) return { name: "worker", ok: false, detail: "no heartbeat has ever been recorded" };
    const ageMs = now.getTime() - row.updatedAt.getTime();
    const ok = ageMs <= WORKER_HEARTBEAT_MAX_AGE_MS;
    return { name: "worker", ok, detail: `last heartbeat ${Math.round(ageMs / 1000)}s ago (limit ${WORKER_HEARTBEAT_MAX_AGE_MS / 1000}s)` };
  });
}

async function checkNotificationQueue(now: Date): Promise<HealthCheck> {
  return guarded("notification_queue", async () => {
    // Across every business: NotificationJob has row level security scoped
    // to marea_app's own tenant connection, so this one query needs
    // marea_worker's unrestricted policy on it instead (see the row level
    // security migration's own worker_all policy).
    const oldestDue = await systemPrisma.notificationJob.findFirst({
      where: { status: "QUEUED", runAfter: { lte: now } },
      orderBy: { runAfter: "asc" },
      select: { runAfter: true },
    });
    if (!oldestDue) return { name: "notification_queue", ok: true, detail: "nothing due" };
    const ageMs = now.getTime() - oldestDue.runAfter.getTime();
    const ok = ageMs <= QUEUE_BACKLOG_MAX_AGE_MS;
    return {
      name: "notification_queue",
      ok,
      detail: `oldest due job waiting ${Math.round(ageMs / 1000)}s (limit ${QUEUE_BACKLOG_MAX_AGE_MS / 1000}s)`,
    };
  });
}

async function checkLatestBackup(now: Date): Promise<HealthCheck> {
  return guarded("backup", async () => {
    const row = await prisma.opsTaskRun.findFirst({
      where: { task: BACKUP_TASK, status: "SUCCEEDED" },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    });
    if (!row?.finishedAt) return { name: "backup", ok: false, detail: "no successful backup has ever been recorded" };
    const ageMs = now.getTime() - row.finishedAt.getTime();
    const ok = ageMs <= BACKUP_MAX_AGE_MS;
    return { name: "backup", ok, detail: `last successful backup ${Math.round(ageMs / 3_600_000)}h ago (limit ${BACKUP_MAX_AGE_MS / 3_600_000}h)` };
  });
}

/**
 * What the external monitor watches (app/api/status/route.ts): the
 * balancer's own /api/health only proves the database is reachable and the
 * process is answering — this is everything that would leave a diner
 * unaffected in the next few minutes but a business owner unpaid, unfed,
 * or unbacked-up if left alone.
 */
export async function buildHealthReport(now = new Date()): Promise<HealthReport> {
  const checks = await Promise.all([checkDatabase(), checkWorkerHeartbeat(now), checkNotificationQueue(now), checkLatestBackup(now)]);
  return { ok: checks.every((c) => c.ok), checks };
}
