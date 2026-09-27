import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { makeBusiness } from "@/test/factories";
import {
  BACKUP_MAX_AGE_MS,
  QUEUE_BACKLOG_MAX_AGE_MS,
  WORKER_HEARTBEAT_MAX_AGE_MS,
  buildHealthReport,
  writeWorkerHeartbeat,
} from "./health";
import { BACKUP_TASK } from "./backup";

function checksByName(report: Awaited<ReturnType<typeof buildHealthReport>>) {
  return Object.fromEntries(report.checks.map((c) => [c.name, c]));
}

describe("buildHealthReport", () => {
  it("is ok when the worker just beat, nothing is due, and the backup is fresh", async () => {
    const now = new Date("2027-01-01T12:00:00Z");
    await writeWorkerHeartbeat(now);
    await prisma.opsTaskRun.create({
      data: { task: BACKUP_TASK, slot: "2027-01-01T06", status: "SUCCEEDED", finishedAt: new Date(now.getTime() - 60_000) },
    });

    const report = await buildHealthReport(now);

    expect(report.ok).toBe(true);
    const byName = checksByName(report);
    expect(byName.database.ok).toBe(true);
    expect(byName.worker).toMatchObject({ ok: true });
    expect(byName.notification_queue).toMatchObject({ ok: true, detail: "nothing due" });
    expect(byName.backup.ok).toBe(true);
  });

  it("flags the worker once its heartbeat is older than the limit", async () => {
    const now = new Date("2027-01-01T12:00:00Z");
    await writeWorkerHeartbeat(new Date(now.getTime() - WORKER_HEARTBEAT_MAX_AGE_MS - 1_000));

    const report = await buildHealthReport(now);

    expect(report.ok).toBe(false);
    expect(checksByName(report).worker.ok).toBe(false);
  });

  it("says so when the worker has never reported in", async () => {
    const report = await buildHealthReport(new Date());
    expect(checksByName(report).worker).toMatchObject({ ok: false, detail: expect.stringContaining("has ever been recorded") });
  });

  it("flags the queue once the oldest due job has waited past the limit, across every business", async () => {
    const now = new Date("2027-01-01T12:00:00Z");
    await writeWorkerHeartbeat(now);
    const business = await makeBusiness();
    await prisma.notificationJob.create({
      data: {
        businessId: business.id,
        channel: "EMAIL",
        templateKey: "order.ready",
        recipientEmail: "a@example.com",
        payload: {},
        status: "QUEUED",
        runAfter: new Date(now.getTime() - QUEUE_BACKLOG_MAX_AGE_MS - 1_000),
      },
    });

    const report = await buildHealthReport(now);

    expect(checksByName(report).notification_queue.ok).toBe(false);
  });

  it("does not flag a job that is merely retrying with a future runAfter", async () => {
    const now = new Date("2027-01-01T12:00:00Z");
    await writeWorkerHeartbeat(now);
    const business = await makeBusiness();
    // Created long ago, but not due for another hour (backoffMs's own cap) — not stuck.
    await prisma.notificationJob.create({
      data: {
        businessId: business.id,
        channel: "EMAIL",
        templateKey: "order.ready",
        recipientEmail: "a@example.com",
        payload: {},
        status: "QUEUED",
        attempts: 3,
        createdAt: new Date(now.getTime() - 5 * 60 * 60 * 1000),
        runAfter: new Date(now.getTime() + 30 * 60 * 1000),
      },
    });

    const report = await buildHealthReport(now);

    expect(checksByName(report).notification_queue).toMatchObject({ ok: true, detail: "nothing due" });
  });

  it("flags the backup once it is older than the limit, and when none ever succeeded", async () => {
    const now = new Date("2027-01-01T12:00:00Z");
    await writeWorkerHeartbeat(now);

    const never = await buildHealthReport(now);
    expect(checksByName(never).backup).toMatchObject({ ok: false, detail: expect.stringContaining("has ever been recorded") });

    await prisma.opsTaskRun.create({
      data: { task: BACKUP_TASK, slot: "old", status: "SUCCEEDED", finishedAt: new Date(now.getTime() - BACKUP_MAX_AGE_MS - 1_000) },
    });
    const stale = await buildHealthReport(now);
    expect(checksByName(stale).backup.ok).toBe(false);

    await prisma.opsTaskRun.create({
      data: { task: BACKUP_TASK, slot: "failed", status: "FAILED", finishedAt: now },
    });
    const stillStale = await buildHealthReport(now);
    expect(checksByName(stillStale).backup.ok).toBe(false);
  });
});
