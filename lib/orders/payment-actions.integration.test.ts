import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { getOrderPaymentDetailAction } from "./payment-actions";
import { makeBusiness, makeOrder, makeStaff } from "@/test/factories";
import { setTestSession, sessionUserFromRow } from "@/test/stubs/auth-session";

async function loginAsStaff() {
  const user = await makeStaff("STAFF");
  setTestSession(sessionUserFromRow(user));
}

describe("getOrderPaymentDetailAction", () => {
  it("returns null for an order id that doesn't belong to the current business", async () => {
    await makeBusiness({ slug: "marea" });
    await loginAsStaff();

    const detail = await getOrderPaymentDetailAction("does-not-exist");

    expect(detail).toBeNull();
  });

  it("returns the payment detail, including refund rows, for a real order", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsStaff();
    const order = await makeOrder(business.id, { total: "23.19" });
    const payment = await prisma.payment.create({
      data: {
        businessId: business.id,
        orderId: order.id,
        provider: "STRIPE",
        status: "SUCCEEDED",
        amount: "23.19",
      },
    });
    await prisma.refund.create({
      data: { paymentId: payment.id, amount: "5.00", status: "SUCCEEDED", reason: "guest request" },
    });

    const detail = await getOrderPaymentDetailAction(order.id);

    expect(detail?.paidTotal).toBe("23.19");
    expect(detail?.refundedTotal).toBe("5.00");
    expect(detail?.payments[0].refunds[0].reason).toBe("guest request");
  });

  it("rejects a caller with no staff session", async () => {
    await makeBusiness({ slug: "marea" });
    await expect(getOrderPaymentDetailAction("any-id")).rejects.toThrow();
  });
});
