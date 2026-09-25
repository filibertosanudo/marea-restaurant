import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { makeBusiness, makeOrder } from "@/test/factories";

// The guards of migration 20260927000100_stripe_connect_guards. They run as the
// owner here on purpose: the trigger and the constraints apply to every role, and
// the point is that nothing, not even the code that wrote the row, can change it.

async function paymentOn(account: string | null) {
  const business = await makeBusiness();
  const order = await makeOrder(business.id);
  return prisma.payment.create({
    data: {
      businessId: business.id,
      orderId: order.id,
      provider: "STRIPE",
      status: "PENDING",
      amount: "10.00",
      stripePaymentIntentId: `pi_${business.id}`,
      stripeAccountId: account,
    },
  });
}

describe("Payment.stripeAccountId", () => {
  it("is written at creation and reads back, and NULL is the platform's account", async () => {
    expect((await paymentOn("acct_shop")).stripeAccountId).toBe("acct_shop");
    expect((await paymentOn(null)).stripeAccountId).toBeNull();
  });

  it("never changes afterwards, from a value to another, to nothing, or from nothing to a value", async () => {
    const connected = await paymentOn("acct_shop");
    const platform = await paymentOn(null);

    await expect(prisma.payment.update({ where: { id: connected.id }, data: { stripeAccountId: "acct_other" } })).rejects.toThrow(/cannot change/);
    await expect(prisma.payment.update({ where: { id: connected.id }, data: { stripeAccountId: null } })).rejects.toThrow(/cannot change/);
    // The case that matters most: an old platform payment cannot be re-labelled.
    await expect(prisma.payment.update({ where: { id: platform.id }, data: { stripeAccountId: "acct_shop" } })).rejects.toThrow(/cannot change/);

    expect((await prisma.payment.findUniqueOrThrow({ where: { id: platform.id } })).stripeAccountId).toBeNull();
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: connected.id } })).stripeAccountId).toBe("acct_shop");
  });

  it("does not get in the way of every other update, including one that restates the same account", async () => {
    const connected = await paymentOn("acct_shop");

    await prisma.payment.update({ where: { id: connected.id }, data: { status: "SUCCEEDED", paidAt: new Date() } });
    await prisma.payment.update({ where: { id: connected.id }, data: { stripeAccountId: "acct_shop" } });

    expect((await prisma.payment.findUniqueOrThrow({ where: { id: connected.id } })).status).toBe("SUCCEEDED");
  });
});

describe("Business Stripe columns", () => {
  it("holds one business per connected account, and any number without one", async () => {
    await makeBusiness({ stripeAccountId: "acct_one" });
    await makeBusiness();
    await makeBusiness();

    await expect(makeBusiness({ stripeAccountId: "acct_one" })).rejects.toThrow(/Unique constraint|unique/i);
  });

  it("stores the card payments status Stripe reports, and no status for a business with no account", async () => {
    const business = await makeBusiness({ stripeAccountId: "acct_one", stripeCardPaymentsStatus: "PENDING", stripeStatusCheckedAt: new Date() });
    expect(business.stripeCardPaymentsStatus).toBe("PENDING");
    expect((await makeBusiness()).stripeCardPaymentsStatus).toBeNull();
  });

  it("takes a country only as two capital letters", async () => {
    await expect(makeBusiness({ country: "MX" })).resolves.toMatchObject({ country: "MX" });
    await expect(makeBusiness()).resolves.toMatchObject({ country: null });
    for (const bad of ["mx", "M", "M1", ""]) {
      await expect(makeBusiness({ country: bad }), bad).rejects.toThrow(/business_country_iso/);
    }
    // Three letters do not even fit the VARCHAR(2) column.
    await expect(makeBusiness({ country: "MEX" })).rejects.toThrow();
  });
});
