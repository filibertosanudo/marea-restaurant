import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { NotificationJob } from "@/lib/generated/prisma/client";
import { getCurrentBusiness } from "@/lib/business";
import { getMailer } from "@/lib/notifications";
import { MailerError } from "@/lib/notifications/mailer";
import { renderTemplate, UnknownTemplateError } from "@/lib/notifications/templates/registry";
import type { TemplateBusiness } from "@/lib/notifications/templates/types";

// How long a lease is honored before another worker is allowed to steal
// the job. Long enough to cover a slow SMTP handshake plus the render
// step; short enough that a crashed worker's jobs recover in minutes, not
// hours. Chosen independently of BATCH_LIMIT/poll interval — this is
// about surviving a dead worker, not about normal throughput.
const LEASE_DURATION_MINUTES = 5;

const BASE_BACKOFF_MS = 60 * 1000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;

/** Exponential backoff on attempts, capped — attempts=1 -> 2min, 2 -> 4min, 3 -> 8min, ... */
export function backoffMs(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempts);
}

type ClaimedJob = NotificationJob;

/**
 * Claims up to `limit` sendable jobs for this worker: freshly QUEUED ones
 * whose runAfter has arrived, plus PROCESSING ones whose lease expired
 * because whoever held it died mid-send. `FOR UPDATE SKIP LOCKED` is what
 * lets multiple workers run this concurrently without coordinating —
 * each just skips whatever row another worker already has locked, per
 * the algorithm the schema's own comment on NotificationJob documents.
 *
 * The claim (SELECT + status flip to PROCESSING) is the only part that
 * runs inside a transaction — sending never does, per this module's own
 * hard rule against holding a DB connection open across a network call
 * that can take thirty seconds.
 */
async function claimBatch(limit: number, workerId: string): Promise<ClaimedJob[]> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "NotificationJob"
      WHERE channel = 'EMAIL'
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

    await tx.notificationJob.updateMany({
      where: { id: { in: ids } },
      data: { status: "PROCESSING", lockedAt: new Date(), lockedBy: workerId },
    });
    return tx.notificationJob.findMany({ where: { id: { in: ids } } });
  });
}

/** True for a failure a retry can't fix: a bad address, or a templateKey with no template. */
export function isPermanentFailure(err: unknown): boolean {
  if (err instanceof UnknownTemplateError) return true;
  if (err instanceof MailerError) return err.permanent;
  return false;
}

async function sendOne(job: ClaimedJob, business: TemplateBusiness): Promise<void> {
  const email = await renderTemplate(job.templateKey, job.payload, job.locale, business);
  if (!job.recipientEmail) {
    // Shouldn't happen — every enqueue site requires guestEmail/user.email
    // first — but a null recipient is unambiguously permanent, never a
    // reason to retry.
    throw new MailerError("Job has no recipientEmail", true);
  }

  const mailer = getMailer();
  await mailer.send({
    to: job.recipientEmail,
    subject: email.subject,
    html: email.html,
    text: email.text,
    idempotencyKey: job.dedupeKey ?? undefined,
  });
}

async function markSent(jobId: string): Promise<void> {
  await prisma.notificationJob.update({
    where: { id: jobId },
    data: { status: "SENT", sentAt: new Date(), lockedAt: null, lockedBy: null },
  });
}

async function markFailedOrRetry(job: ClaimedJob, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const permanent = isPermanentFailure(err);
  const attempts = job.attempts + 1;

  if (permanent || attempts >= job.maxAttempts) {
    await prisma.notificationJob.update({
      where: { id: job.id },
      data: { status: "FAILED", attempts, lastError: message, lockedAt: null, lockedBy: null },
    });
    console.error(
      `[notifications] job ${job.id} (${job.templateKey}) failed permanently after ${attempts} attempt(s): ${message}`
    );
    return;
  }

  await prisma.notificationJob.update({
    where: { id: job.id },
    data: {
      status: "QUEUED",
      attempts,
      lastError: message,
      runAfter: new Date(Date.now() + backoffMs(attempts)),
      lockedAt: null,
      lockedBy: null,
    },
  });
}

export type ProcessQueueResult = { claimed: number; sent: number; failed: number };

/**
 * The one function both execution modes call — scripts/worker.ts in a
 * poll loop, app/api/cron/notifications/route.ts once per invocation.
 * Neither knows anything about SMTP, react-email, or Postgres locking;
 * that's entirely here, so the choice of hosting never leaks into it.
 */
export async function processQueue(limit: number): Promise<ProcessQueueResult> {
  const workerId = `${process.pid}-${randomBytes(4).toString("hex")}`;
  const jobs = await claimBatch(limit, workerId);
  if (jobs.length === 0) return { claimed: 0, sent: 0, failed: 0 };

  const business = await getCurrentBusiness();
  const templateBusiness: TemplateBusiness = {
    name: business.name,
    address: [business.addressLine1, business.addressLine2, business.city].filter(Boolean).join(", ") || null,
    phone: business.phone,
  };

  let sent = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      await sendOne(job, templateBusiness);
      await markSent(job.id);
      sent += 1;
    } catch (err) {
      await markFailedOrRetry(job, err);
      failed += 1;
    }
  }

  return { claimed: jobs.length, sent, failed };
}

// Re-exported for the admin queue screen's manual retry button (Fase 4) —
// resets a FAILED job back to QUEUED so the next poll picks it up, without
// duplicating this same shape of update at the call site. Scoped to
// businessId, same as every other admin mutation in this codebase — an
// admin's session only ever gets jobId from their own business's own
// queue screen, but the query stays scoped regardless of what the caller
// trusts the input to be.
export async function retryJob(jobId: string, businessId: string): Promise<void> {
  await prisma.notificationJob.updateMany({
    where: { id: jobId, businessId, status: "FAILED" },
    data: { status: "QUEUED", runAfter: new Date(), lockedAt: null, lockedBy: null },
  });
}

