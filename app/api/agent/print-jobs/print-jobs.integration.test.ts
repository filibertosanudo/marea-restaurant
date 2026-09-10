import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { makeBusiness, makeOrder } from "@/test/factories";
import { generateDeviceToken } from "@/lib/devices/token";
import { enqueueKitchenTicket } from "@/lib/printing/queue";
import { POST as claim } from "./claim/route";
import { POST as complete } from "./[id]/complete/route";
import { POST as fail } from "./[id]/fail/route";

const DOCUMENT = { lines: [{ type: "text" as const, text: "A-0001" }], cut: true };

function claimRequest(token: string) {
  return new Request("http://localhost/api/agent/print-jobs/claim", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
}

function actionRequest(token: string, body?: object) {
  return new Request("http://localhost/api/agent/print-jobs/x/complete", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function makeActiveDevice(businessId: string) {
  const { token, tokenHash } = generateDeviceToken();
  const device = await prisma.device.create({ data: { businessId, name: "Impresora cocina", tokenHash } });
  return { device, token };
}

describe("POST /api/agent/print-jobs/claim", () => {
  it("rejects an unauthenticated request", async () => {
    const response = await claim(claimRequest("not-a-real-token"));
    expect(response.status).toBe(401);
  });

  it("returns the claiming device's own queued kitchen tickets as ready-to-print documents", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id);
    const job = await enqueueKitchenTicket(prisma, { businessId: business.id, orderId: order.id, document: DOCUMENT });
    const { token } = await makeActiveDevice(business.id);

    const response = await claim(claimRequest(token));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0]).toMatchObject({ id: job.id, kind: "KITCHEN_TICKET", document: DOCUMENT });
  });

  it("never returns another business's jobs", async () => {
    const business = await makeBusiness();
    const otherBusiness = await makeBusiness();
    const order = await makeOrder(otherBusiness.id);
    await enqueueKitchenTicket(prisma, { businessId: otherBusiness.id, orderId: order.id, document: DOCUMENT });
    const { token } = await makeActiveDevice(business.id);

    const response = await claim(claimRequest(token));
    const body = await response.json();

    expect(body.jobs).toHaveLength(0);
  });
});

describe("POST /api/agent/print-jobs/[id]/complete", () => {
  it("marks a claimed job SENT", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id);
    const job = await enqueueKitchenTicket(prisma, { businessId: business.id, orderId: order.id, document: DOCUMENT });
    const { token } = await makeActiveDevice(business.id);
    await claim(claimRequest(token));

    const response = await complete(actionRequest(token), { params: Promise.resolve({ id: job.id }) });

    expect(response.status).toBe(200);
    const updated = await prisma.printJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("SENT");
  });

  it("rejects an unauthenticated request", async () => {
    const response = await complete(actionRequest("bad-token"), { params: Promise.resolve({ id: "whatever" }) });
    expect(response.status).toBe(401);
  });
});

describe("POST /api/agent/print-jobs/[id]/fail", () => {
  it("re-queues a reported failure with the agent's error message recorded", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id);
    const job = await enqueueKitchenTicket(prisma, { businessId: business.id, orderId: order.id, document: DOCUMENT });
    const { token } = await makeActiveDevice(business.id);
    await claim(claimRequest(token));

    const response = await fail(actionRequest(token, { error: "printer out of paper" }), {
      params: Promise.resolve({ id: job.id }),
    });

    expect(response.status).toBe(200);
    const updated = await prisma.printJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe("QUEUED");
    expect(updated.lastError).toBe("printer out of paper");
  });

  it("returns not_found for a job this device never claimed", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id);
    const job = await enqueueKitchenTicket(prisma, { businessId: business.id, orderId: order.id, document: DOCUMENT });
    const { token } = await makeActiveDevice(business.id);

    const response = await fail(actionRequest(token, { error: "x" }), { params: Promise.resolve({ id: job.id }) });

    expect(response.status).toBe(404);
  });
});
