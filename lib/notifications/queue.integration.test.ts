import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { makeBusiness } from "@/test/factories";
import { runConcurrently } from "@/test/concurrency";
import { getMailer } from "@/lib/notifications";
import { MailerError } from "@/lib/notifications/mailer";
import { processQueue, retryJob, backoffMs } from "./queue";

vi.mock("@/lib/notifications", () => ({ getMailer: vi.fn() }));

function makeCurrentBusiness() {
  return makeBusiness({ slug: "marea", name: "Marea", addressLine1: "Av. del Mar 123", phone: "+52 55 0000 0000" });
}

function stubMailer(impl: (msg: { to: string }) => Promise<{ providerMessageId: string | null }>) {
  vi.mocked(getMailer).mockReturnValue({ send: vi.fn(impl) });
}

async function makeQueuedJob(businessId: string, overrides: Record<string, unknown> = {}) {
  return prisma.notificationJob.create({
    data: {
      businessId,
      channel: "EMAIL",
      templateKey: "order.ready",
      recipientEmail: "ana@example.com",
      payload: { orderNumber: "A-0001", orderUrl: "https://marea.test/o/tok" },
      ...overrides,
    },
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("processQueue", () => {
  it("sends a due job and marks it SENT", async () => {
    const business = await makeCurrentBusiness();
    const job = await makeQueuedJob(business.id);
    stubMailer(async () => ({ providerMessageId: "msg-1" }));

    const result = await processQueue(20);

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
    const updated = await prisma.notificationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("SENT");
    expect(updated.sentAt).not.toBeNull();
    expect(updated.lockedAt).toBeNull();
    expect(updated.lockedBy).toBeNull();
  });

  it("never claims a job whose runAfter is still in the future", async () => {
    const business = await makeCurrentBusiness();
    await makeQueuedJob(business.id, { runAfter: new Date(Date.now() + 60_000) });
    stubMailer(async () => ({ providerMessageId: "msg-1" }));

    const result = await processQueue(20);

    expect(result).toEqual({ claimed: 0, sent: 0, failed: 0 });
  });

  it("never claims a non-EMAIL job — this worker only knows how to send email", async () => {
    const business = await makeCurrentBusiness();
    await makeQueuedJob(business.id, { channel: "SMS" });
    stubMailer(async () => ({ providerMessageId: "msg-1" }));

    const result = await processQueue(20);

    expect(result).toEqual({ claimed: 0, sent: 0, failed: 0 });
  });

  it("passes the job's dedupeKey through as the mailer's idempotency key", async () => {
    const business = await makeCurrentBusiness();
    await makeQueuedJob(business.id, { dedupeKey: `order:${business.id}:READY` });
    const send = vi.fn(async () => ({ providerMessageId: "msg-1" }));
    vi.mocked(getMailer).mockReturnValue({ send });

    await processQueue(20);

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: `order:${business.id}:READY` }));
  });

  it("marks FAILED on the first attempt for a permanent MailerError, without retrying", async () => {
    const business = await makeCurrentBusiness();
    const job = await makeQueuedJob(business.id);
    stubMailer(async () => {
      throw new MailerError("mailbox does not exist", true);
    });

    const result = await processQueue(20);

    expect(result).toEqual({ claimed: 1, sent: 0, failed: 1 });
    const updated = await prisma.notificationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("FAILED");
    expect(updated.attempts).toBe(1);
    expect(updated.lastError).toContain("mailbox does not exist");
  });

  it("marks FAILED immediately for a templateKey with no matching template", async () => {
    const business = await makeCurrentBusiness();
    const job = await makeQueuedJob(business.id, { templateKey: "order.nonexistent_status" });
    stubMailer(async () => ({ providerMessageId: "msg-1" }));

    await processQueue(20);

    const updated = await prisma.notificationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("FAILED");
    expect(updated.lastError).toContain("order.nonexistent_status");
  });

  it("re-queues a transient failure with exponential backoff instead of failing it", async () => {
    const business = await makeCurrentBusiness();
    const job = await makeQueuedJob(business.id);
    stubMailer(async () => {
      throw new MailerError("connection reset", false);
    });
    const before = Date.now();

    await processQueue(20);

    const updated = await prisma.notificationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("QUEUED");
    expect(updated.attempts).toBe(1);
    expect(updated.lockedAt).toBeNull();
    expect(updated.runAfter.getTime()).toBeGreaterThanOrEqual(before + backoffMs(1) - 1000);
  });

  it("exhausts maxAttempts on repeated transient failures and then fails permanently", async () => {
    const business = await makeCurrentBusiness();
    const job = await makeQueuedJob(business.id, { maxAttempts: 2, runAfter: new Date() });
    stubMailer(async () => {
      throw new MailerError("connection reset", false);
    });

    // First attempt: transient, re-queued.
    await processQueue(20);
    let updated = await prisma.notificationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("QUEUED");
    expect(updated.attempts).toBe(1);

    // Force it due again instead of waiting out the real backoff.
    await prisma.notificationJob.update({ where: { id: job.id }, data: { runAfter: new Date() } });

    // Second attempt hits maxAttempts: permanently FAILED, not re-queued a third time.
    await processQueue(20);
    updated = await prisma.notificationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("FAILED");
    expect(updated.attempts).toBe(2);
  });

  it("recovers a job whose lease expired because its worker died mid-send", async () => {
    const business = await makeCurrentBusiness();
    const job = await makeQueuedJob(business.id, {
      status: "PROCESSING",
      lockedAt: new Date(Date.now() - 10 * 60 * 1000),
      lockedBy: "dead-worker-123",
    });
    stubMailer(async () => ({ providerMessageId: "msg-1" }));

    const result = await processQueue(20);

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
    const updated = await prisma.notificationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("SENT");
  });

  it("never steals a job whose lease is still fresh", async () => {
    const business = await makeCurrentBusiness();
    await makeQueuedJob(business.id, {
      status: "PROCESSING",
      lockedAt: new Date(),
      lockedBy: "another-live-worker",
    });
    stubMailer(async () => ({ providerMessageId: "msg-1" }));

    const result = await processQueue(20);

    expect(result).toEqual({ claimed: 0, sent: 0, failed: 0 });
  });

  it("two workers racing the same due job only ever send it once", async () => {
    const business = await makeCurrentBusiness();
    const job = await makeQueuedJob(business.id);
    let sendCount = 0;
    stubMailer(async () => {
      sendCount += 1;
      return { providerMessageId: "msg-1" };
    });

    const results = await runConcurrently([() => processQueue(20), () => processQueue(20)]);

    expect(sendCount).toBe(1);
    const totalClaimed = results.reduce(
      (sum, r) => sum + (r.status === "fulfilled" ? r.value.claimed : 0),
      0
    );
    expect(totalClaimed).toBe(1);
    const updated = await prisma.notificationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("SENT");
  });
});

describe("retryJob", () => {
  it("moves a FAILED job back to QUEUED so the next poll picks it up", async () => {
    const business = await makeCurrentBusiness();
    const job = await makeQueuedJob(business.id, {
      status: "FAILED",
      attempts: 5,
      lastError: "mailbox does not exist",
    });

    await retryJob(job.id);

    const updated = await prisma.notificationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("QUEUED");
    expect(updated.runAfter.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("does nothing to a job that isn't FAILED", async () => {
    const business = await makeCurrentBusiness();
    const job = await makeQueuedJob(business.id, { status: "SENT", sentAt: new Date() });

    await retryJob(job.id);

    const updated = await prisma.notificationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("SENT");
  });
});
