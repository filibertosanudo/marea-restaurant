import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { makeBusiness, makeOrder } from "@/test/factories";
import { runConcurrently } from "@/test/concurrency";
import {
  backoffMs,
  claimPrintJobs,
  enqueueKitchenTicket,
  findClaimedPrintJob,
  markPrintJobFailedOrRetry,
  markPrintJobSent,
} from "./queue";
import type { PrintDocument } from "./document";

const DOCUMENT: PrintDocument = { lines: [{ type: "text", text: "A-0001" }], cut: true };

async function makeQueuedTicket(businessId: string, orderId: string) {
  return enqueueKitchenTicket(prisma, { businessId, orderId, document: DOCUMENT });
}

describe("claimPrintJobs", () => {
  it("claims a due QUEUED job and flips it to PROCESSING under the claiming device's id", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id);
    const job = await makeQueuedTicket(business.id, order.id);

    const claimed = await claimPrintJobs(business.id, "device-1", 10);

    expect(claimed).toHaveLength(1);
    expect(claimed[0].id).toBe(job.id);
    const updated = await prisma.printJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("PROCESSING");
    expect(updated.lockedBy).toBe("device-1");
    expect(updated.lockedAt).not.toBeNull();
  });

  it("never claims a job whose runAfter is still in the future", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id);
    const job = await makeQueuedTicket(business.id, order.id);
    await prisma.printJob.update({ where: { id: job.id }, data: { runAfter: new Date(Date.now() + 60_000) } });

    const claimed = await claimPrintJobs(business.id, "device-1", 10);

    expect(claimed).toHaveLength(0);
  });

  it("never claims another business's job", async () => {
    const business = await makeBusiness();
    const otherBusiness = await makeBusiness();
    const order = await makeOrder(otherBusiness.id);
    await makeQueuedTicket(otherBusiness.id, order.id);

    const claimed = await claimPrintJobs(business.id, "device-1", 10);

    expect(claimed).toHaveLength(0);
  });

  it("recovers a job whose lease expired because the device that held it never reported back", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id);
    const job = await makeQueuedTicket(business.id, order.id);
    await prisma.printJob.update({
      where: { id: job.id },
      data: { status: "PROCESSING", lockedAt: new Date(Date.now() - 10 * 60 * 1000), lockedBy: "dead-device" },
    });

    const claimed = await claimPrintJobs(business.id, "device-1", 10);

    expect(claimed).toHaveLength(1);
  });

  it("never steals a job whose lease is still fresh", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id);
    const job = await makeQueuedTicket(business.id, order.id);
    await prisma.printJob.update({
      where: { id: job.id },
      data: { status: "PROCESSING", lockedAt: new Date(), lockedBy: "another-live-device" },
    });

    const claimed = await claimPrintJobs(business.id, "device-1", 10);

    expect(claimed).toHaveLength(0);
  });

  it("two devices racing the same due job only ever have one of them claim it", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id);
    await makeQueuedTicket(business.id, order.id);

    const results = await runConcurrently([
      () => claimPrintJobs(business.id, "device-a", 10),
      () => claimPrintJobs(business.id, "device-b", 10),
    ]);

    const totalClaimed = results.reduce(
      (sum, r) => sum + (r.status === "fulfilled" ? r.value.length : 0),
      0
    );
    expect(totalClaimed).toBe(1);
  });
});

describe("markPrintJobSent / markPrintJobFailedOrRetry", () => {
  it("marks a claimed job SENT with printedAt set", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id);
    const job = await makeQueuedTicket(business.id, order.id);
    await claimPrintJobs(business.id, "device-1", 10);

    await markPrintJobSent(job.id, business.id);

    const updated = await prisma.printJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("SENT");
    expect(updated.printedAt).not.toBeNull();
  });

  it("never marks SENT a job belonging to a different business", async () => {
    const business = await makeBusiness();
    const otherBusiness = await makeBusiness();
    const order = await makeOrder(business.id);
    const job = await makeQueuedTicket(business.id, order.id);
    await claimPrintJobs(business.id, "device-1", 10);

    await markPrintJobSent(job.id, otherBusiness.id);

    const updated = await prisma.printJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("PROCESSING");
  });

  it("re-queues a failure with exponential backoff below maxAttempts", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id);
    const job = await makeQueuedTicket(business.id, order.id);
    const [claimed] = await claimPrintJobs(business.id, "device-1", 10);
    const before = Date.now();

    await markPrintJobFailedOrRetry(claimed, "no paper");

    const updated = await prisma.printJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("QUEUED");
    expect(updated.attempts).toBe(1);
    expect(updated.lastError).toBe("no paper");
    expect(updated.lockedAt).toBeNull();
    expect(updated.runAfter.getTime()).toBeGreaterThanOrEqual(before + backoffMs(1) - 1000);
  });

  it("fails permanently once attempts reach maxAttempts", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id);
    const job = await makeQueuedTicket(business.id, order.id);
    await prisma.printJob.update({ where: { id: job.id }, data: { maxAttempts: 1 } });
    const [claimed] = await claimPrintJobs(business.id, "device-1", 10);

    await markPrintJobFailedOrRetry(claimed, "printer offline");

    const updated = await prisma.printJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("FAILED");
    expect(updated.attempts).toBe(1);
  });
});

describe("findClaimedPrintJob", () => {
  it("finds a job this device currently has PROCESSING", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id);
    const job = await makeQueuedTicket(business.id, order.id);
    await claimPrintJobs(business.id, "device-1", 10);

    const found = await findClaimedPrintJob(job.id, business.id);

    expect(found?.id).toBe(job.id);
  });

  it("returns null for a job still sitting QUEUED (never claimed)", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id);
    const job = await makeQueuedTicket(business.id, order.id);

    const found = await findClaimedPrintJob(job.id, business.id);

    expect(found).toBeNull();
  });

  it("returns null across a business boundary", async () => {
    const business = await makeBusiness();
    const otherBusiness = await makeBusiness();
    const order = await makeOrder(business.id);
    const job = await makeQueuedTicket(business.id, order.id);
    await claimPrintJobs(business.id, "device-1", 10);

    const found = await findClaimedPrintJob(job.id, otherBusiness.id);

    expect(found).toBeNull();
  });
});
