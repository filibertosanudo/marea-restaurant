import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { writeWorkerHeartbeat } from "@/lib/ops/health";
import { BACKUP_TASK } from "@/lib/ops/backup";

process.env.STATUS_CHECK_TOKEN = "a-token-at-least-16-chars";

function request(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/status", { headers });
}

describe("GET /api/status", () => {
  it("is 200 with only { ok: true } when nothing is wrong and no token is given", async () => {
    await writeWorkerHeartbeat();
    await prisma.opsTaskRun.create({ data: { task: BACKUP_TASK, slot: "now", status: "SUCCEEDED", finishedAt: new Date() } });
    const { GET } = await import("./route");

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("is 503 with only { ok: false } when something is wrong and no token is given", async () => {
    // No heartbeat, no backup: several checks fail.
    const { GET } = await import("./route");

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
  });

  it("gives the full per-check breakdown to a request bearing the token", async () => {
    const { GET } = await import("./route");

    const response = await GET(request({ authorization: "Bearer a-token-at-least-16-chars" }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.checks.map((c: { name: string }) => c.name).sort()).toEqual(["backup", "database", "notification_queue", "worker"]);
  });

  it("refuses a wrong token the same as no token at all", async () => {
    const { GET } = await import("./route");

    const response = await GET(request({ authorization: "Bearer not-the-right-token-at-all" }));

    expect(await response.json()).toEqual({ ok: false });
  });
});
