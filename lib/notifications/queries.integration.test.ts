import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { listRecentNotificationJobs, countDueNotificationJobs } from "./queries";
import { makeBusiness } from "@/test/factories";

function makeJob(businessId: string, overrides: Record<string, unknown> = {}) {
  return prisma.notificationJob.create({
    data: {
      businessId,
      channel: "EMAIL",
      templateKey: "order.ready",
      recipientEmail: "ana@example.com",
      payload: {},
      ...overrides,
    },
  });
}

describe("listRecentNotificationJobs", () => {
  it("returns this business's jobs, most recent first", async () => {
    const business = await makeBusiness();
    const other = await makeBusiness();
    const older = await makeJob(business.id, { createdAt: new Date(Date.now() - 60_000) });
    const newer = await makeJob(business.id);
    await makeJob(other.id);

    const jobs = await listRecentNotificationJobs(business.id);

    expect(jobs.map((j) => j.id)).toEqual([newer.id, older.id]);
  });

  it("caps at the given limit", async () => {
    const business = await makeBusiness();
    for (let i = 0; i < 5; i++) await makeJob(business.id);

    const jobs = await listRecentNotificationJobs(business.id, 3);

    expect(jobs).toHaveLength(3);
  });
});

describe("countDueNotificationJobs", () => {
  it("counts only QUEUED jobs whose runAfter has arrived", async () => {
    const business = await makeBusiness();
    await makeJob(business.id, { status: "QUEUED", runAfter: new Date(Date.now() - 1000) });
    await makeJob(business.id, { status: "QUEUED", runAfter: new Date(Date.now() + 60_000) });
    await makeJob(business.id, { status: "SENT", sentAt: new Date() });

    const count = await countDueNotificationJobs(business.id);

    expect(count).toBe(1);
  });
});
