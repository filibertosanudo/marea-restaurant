import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { markPaymentSucceeded } from "./actions";
import { makeBusiness, makeOrder, makeStaff } from "@/test/factories";

async function openSession(businessId: string) {
  const cashier = await makeStaff("STAFF");
  return prisma.cashSession.create({
    data: { businessId, openedById: cashier.id, openingFloat: "0.00" },
  });
}

describe("markPaymentSucceeded / cancelOtherOpenPaymentsIfSettled", () => {
  it("leaves a second open payment alone when the first one succeeding still isn't enough to settle", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id, { total: "30.00" });
    const session = await openSession(business.id);
    const cash = await prisma.payment.create({
      data: { businessId: business.id, orderId: order.id, provider: "CASH_REGISTER", status: "PENDING", amount: "15.00" },
    });
    const card = await prisma.payment.create({
      data: { businessId: business.id, orderId: order.id, provider: "STRIPE", status: "PENDING", amount: "15.00" },
    });

    await prisma.$transaction((tx) => markPaymentSucceeded(tx, cash, "staff_1", session.id));

    const unchangedCard = await prisma.payment.findUniqueOrThrow({ where: { id: card.id } });
    expect(unchangedCard.status).toBe("PENDING");
  });

  it("cancels the other open payment once the first succeeding one fully settles the order", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id, { total: "15.00" });
    const session = await openSession(business.id);
    const cash = await prisma.payment.create({
      data: { businessId: business.id, orderId: order.id, provider: "CASH_REGISTER", status: "PENDING", amount: "15.00" },
    });
    const card = await prisma.payment.create({
      data: { businessId: business.id, orderId: order.id, provider: "STRIPE", status: "PENDING", amount: "15.00" },
    });

    await prisma.$transaction((tx) => markPaymentSucceeded(tx, cash, "staff_1", session.id));

    const cancelledCard = await prisma.payment.findUniqueOrThrow({ where: { id: card.id } });
    expect(cancelledCard.status).toBe("CANCELLED");
  });

  it("attaches the payment to the given cash session", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id, { total: "15.00" });
    const session = await openSession(business.id);
    const cash = await prisma.payment.create({
      data: { businessId: business.id, orderId: order.id, provider: "CASH_REGISTER", status: "PENDING", amount: "15.00" },
    });

    await prisma.$transaction((tx) => markPaymentSucceeded(tx, cash, "staff_1", session.id));

    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: cash.id } });
    expect(updated.cashSessionId).toBe(session.id);
  });
});
