import "server-only";
import { prisma } from "@/lib/prisma";
import type { PrintJob, Prisma } from "@/lib/generated/prisma/client";
import type { PrintDocument } from "@/lib/printing/document";

// Long enough to cover a slow print (a few seconds) plus network hiccups;
// short enough that a crashed agent's jobs recover in minutes. In practice
// a business runs one printer, so lease contention is theoretical — this
// is still the correct primitive for "claim work without racing a device
// that restarted mid-batch and is about to poll again."
const LEASE_DURATION_MINUTES = 2;

const BASE_BACKOFF_MS = 30 * 1000;
const MAX_BACKOFF_MS = 30 * 60 * 1000;

/** Exponential backoff on attempts, capped — same shape as lib/notifications/queue.ts's own backoffMs, kept as its own small copy since the two queues are otherwise unrelated. attempts=1 -> 1min, 2 -> 2min, 3 -> 4min, ... */
export function backoffMs(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempts);
}

/**
 * Enqueues a kitchen ticket. Called two ways: inside the transaction that
 * creates the order (client is `tx`, so a rollback never leaves an
 * orphaned ticket) and, for a manual reprint, directly against `prisma`
 * (client is the plain client) — both shapes expose the same `.printJob`
 * delegate, so one function serves both call sites.
 */
export function enqueueKitchenTicket(
  client: Prisma.TransactionClient,
  input: { businessId: string; orderId: string; document: PrintDocument }
) {
  return client.printJob.create({
    data: {
      businessId: input.businessId,
      relatedOrderId: input.orderId,
      kind: "KITCHEN_TICKET",
      payload: input.document as unknown as Prisma.InputJsonValue,
    },
  });
}

/**
 * Claims up to `limit` sendable jobs for one device's business: freshly
 * QUEUED ones whose runAfter has arrived, plus PROCESSING ones whose lease
 * expired because whoever held it never reported back (a crash mid-print).
 * `FOR UPDATE SKIP LOCKED` is the same primitive lib/notifications/queue.ts
 * uses for the same reason — see that module's header comment.
 */
export async function claimPrintJobs(businessId: string, deviceId: string, limit: number): Promise<PrintJob[]> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "PrintJob"
      WHERE "businessId" = ${businessId}
        AND (
          (status = 'QUEUED' AND "runAfter" <= now())
          OR (status = 'PROCESSING' AND "lockedAt" < now() - (${LEASE_DURATION_MINUTES} * interval '1 minute'))
        )
      ORDER BY "runAfter"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `;
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return [];

    await tx.printJob.updateMany({
      where: { id: { in: ids } },
      data: { status: "PROCESSING", lockedAt: new Date(), lockedBy: deviceId },
    });
    return tx.printJob.findMany({ where: { id: { in: ids } } });
  });
}

/** Scoped to businessId regardless of what the caller trusts jobId to be — same paranoia as every other admin mutation in this codebase, here applied to a bearer-token caller instead of a session. Returns whether a row actually matched. */
export async function findClaimedPrintJob(jobId: string, businessId: string): Promise<PrintJob | null> {
  return prisma.printJob.findFirst({ where: { id: jobId, businessId, status: "PROCESSING" } });
}

export async function markPrintJobSent(jobId: string, businessId: string): Promise<void> {
  await prisma.printJob.updateMany({
    where: { id: jobId, businessId },
    data: { status: "SENT", printedAt: new Date() },
  });
}

export async function markPrintJobFailedOrRetry(job: PrintJob, message: string): Promise<void> {
  const attempts = job.attempts + 1;
  const data =
    attempts >= job.maxAttempts
      ? { status: "FAILED" as const, attempts, lastError: message, lockedAt: null, lockedBy: null }
      : {
          status: "QUEUED" as const,
          attempts,
          lastError: message,
          runAfter: new Date(Date.now() + backoffMs(attempts)),
          lockedAt: null,
          lockedBy: null,
        };
  await prisma.printJob.updateMany({ where: { id: job.id, businessId: job.businessId }, data });
}
