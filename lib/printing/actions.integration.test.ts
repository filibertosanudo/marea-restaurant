import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { makeBusiness, makeStaff } from "@/test/factories";
import { setTestSession, sessionUserFromRow } from "@/test/stubs/auth-session";
import { reprintKitchenTicketAction } from "./actions";

function makeCurrentBusiness() {
  return makeBusiness({ slug: "marea" });
}

async function loginAs(role: "STAFF" | "BUSINESS_ADMIN") {
  const user = await makeStaff(role);
  setTestSession(sessionUserFromRow(user));
  return user;
}

async function makeOrderWithItem(businessId: string) {
  const order = await prisma.order.create({
    data: {
      businessId,
      orderNumber: "A-0099",
      notes: "Sin cebolla en todo",
      items: {
        create: [{ nameSnapshot: "Pescado a la Veracruzana", unitPrice: "180.00", quantity: 2, lineTotal: "360.00" }],
      },
    },
  });
  return order;
}

describe("reprintKitchenTicketAction", () => {
  it("enqueues a brand-new PrintJob built from the order's current state", async () => {
    const business = await makeCurrentBusiness();
    await loginAs("STAFF");
    const order = await makeOrderWithItem(business.id);

    const result = await reprintKitchenTicketAction(order.id);

    expect(result).toEqual({ ok: true });
    const jobs = await prisma.printJob.findMany({ where: { relatedOrderId: order.id } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].kind).toBe("KITCHEN_TICKET");
    expect(jobs[0].status).toBe("QUEUED");
  });

  it("leaves the original PrintJob's history untouched — reprint is a new job, not a reset", async () => {
    const business = await makeCurrentBusiness();
    await loginAs("STAFF");
    const order = await makeOrderWithItem(business.id);
    const original = await prisma.printJob.create({
      data: {
        businessId: business.id,
        relatedOrderId: order.id,
        kind: "KITCHEN_TICKET",
        status: "SENT",
        printedAt: new Date(),
        payload: {},
      },
    });

    await reprintKitchenTicketAction(order.id);

    const untouched = await prisma.printJob.findUniqueOrThrow({ where: { id: original.id } });
    expect(untouched.status).toBe("SENT");
    const allJobs = await prisma.printJob.findMany({ where: { relatedOrderId: order.id } });
    expect(allJobs).toHaveLength(2);
  });

  it("returns not_found for an order outside the caller's business", async () => {
    await makeCurrentBusiness();
    const otherBusiness = await makeBusiness();
    await loginAs("STAFF");
    const order = await makeOrderWithItem(otherBusiness.id);

    const result = await reprintKitchenTicketAction(order.id);

    expect(result).toEqual({ ok: false, error: "not_found" });
  });
});
