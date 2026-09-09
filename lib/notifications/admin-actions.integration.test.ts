import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { retryNotificationJobAction } from "./admin-actions";
import { makeBusiness, makeStaff } from "@/test/factories";
import { setTestSession, sessionUserFromRow } from "@/test/stubs/auth-session";

function makeCurrentBusiness() {
  return makeBusiness({ slug: "marea" });
}

async function loginAs(role: "STAFF" | "BUSINESS_ADMIN") {
  const user = await makeStaff(role);
  setTestSession(sessionUserFromRow(user));
}

async function makeFailedJob(businessId: string) {
  return prisma.notificationJob.create({
    data: {
      businessId,
      channel: "EMAIL",
      templateKey: "order.ready",
      recipientEmail: "ana@example.com",
      status: "FAILED",
      attempts: 5,
      lastError: "mailbox does not exist",
      payload: {},
    },
  });
}

describe("retryNotificationJobAction", () => {
  it("moves a FAILED job back to QUEUED for a BUSINESS_ADMIN", async () => {
    const business = await makeCurrentBusiness();
    await loginAs("BUSINESS_ADMIN");
    const job = await makeFailedJob(business.id);

    await retryNotificationJobAction(job.id);

    const updated = await prisma.notificationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("QUEUED");
  });

  it("rejects a STAFF caller", async () => {
    const business = await makeCurrentBusiness();
    await loginAs("STAFF");
    const job = await makeFailedJob(business.id);

    await expect(retryNotificationJobAction(job.id)).rejects.toThrow();

    const unchanged = await prisma.notificationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(unchanged.status).toBe("FAILED");
  });
});
