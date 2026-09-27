import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { makeBusiness } from "@/test/factories";
import { clearReadOnlyCache } from "@/lib/ops/read-only";
import { POST } from "./route";

process.env.CRON_SECRET = "a-cron-secret-at-least-16-chars";

function request() {
  return new Request("http://localhost/api/cron/notifications", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
}

describe("POST /api/cron/notifications", () => {
  it("refuses with no valid secret", async () => {
    const response = await POST(new Request("http://localhost/api/cron/notifications", { method: "POST" }));
    expect(response.status).toBe(401);
  });

  it("processes the queue when authorized and writable", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
  });
});

describe("POST /api/cron/notifications, read-only mode", () => {
  afterEach(async () => {
    await prisma.readOnlyMode.deleteMany({ where: { scope: "PLATFORM" } });
    clearReadOnlyCache();
  });

  it("answers 503 without touching the queue — the worker's own loop pauses the same way", async () => {
    const business = await makeBusiness();
    const job = await prisma.notificationJob.create({
      data: { businessId: business.id, channel: "EMAIL", templateKey: "order.ready", recipientEmail: "a@example.com", payload: {} },
    });
    await prisma.readOnlyMode.create({ data: { scope: "PLATFORM" } });
    clearReadOnlyCache();

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect((await prisma.notificationJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("QUEUED");
  });
});
