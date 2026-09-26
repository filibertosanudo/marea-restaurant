import { describe, it, expect, vi, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe/client";
import { createPaymentIntentAction } from "./stripe-actions";
import { makeBusiness, makeOrder } from "@/test/factories";
import { setTestHost } from "@/test/stubs/next-headers";

process.env.BUSINESS_ROOT_DOMAIN = "localhost";
import { runConcurrently, partitionSettled } from "@/test/concurrency";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createPaymentIntentAction", () => {
  it("refuses when the business doesn't accept online payment", async () => {
    const business = await makeBusiness({ slug: "marea", acceptsOnlinePayment: false });
    const order = await makeOrder(business.id, { total: "23.19" });

    const result = await createPaymentIntentAction(order.publicToken);

    expect(result).toEqual({ ok: false, error: "online_payment_disabled" });
  });

  it("refuses a business with no Stripe account of its own once another business shares the deployment", async () => {
    const marea = await makeBusiness({ slug: "marea", acceptsOnlinePayment: true });
    await makeBusiness({ slug: "cala", acceptsOnlinePayment: true });
    const order = await makeOrder(marea.id, { total: "23.19" });
    setTestHost("marea.localhost:3000");
    const createSpy = vi.spyOn(stripe.paymentIntents, "create");

    const result = await createPaymentIntentAction(order.publicToken);

    expect(result).toEqual({ ok: false, error: "online_payment_disabled" });
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("reports not_found for an unknown public token", async () => {
    await makeBusiness({ slug: "marea" });

    const result = await createPaymentIntentAction("not-a-real-token");

    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it("refuses a cancelled order", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const order = await makeOrder(business.id, { total: "23.19", status: "CANCELLED" });

    const result = await createPaymentIntentAction(order.publicToken);

    expect(result).toEqual({ ok: false, error: "order_cancelled" });
  });

  it("reports already_paid once the order is fully settled", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const order = await makeOrder(business.id, { total: "23.19" });
    await prisma.payment.create({
      data: { businessId: business.id, orderId: order.id, provider: "STRIPE", status: "SUCCEEDED", amount: "23.19" },
    });

    const result = await createPaymentIntentAction(order.publicToken);

    expect(result).toEqual({ ok: false, error: "already_paid" });
  });

  it("creates a fresh PaymentIntent and records a PENDING payment for it", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const order = await makeOrder(business.id, { total: "23.19" });
    const createSpy = vi.spyOn(stripe.paymentIntents, "create").mockResolvedValue({
      id: "pi_new",
      client_secret: "secret_new",
    } as never);

    const result = await createPaymentIntentAction(order.publicToken);

    expect(result).toEqual({ ok: true, clientSecret: "secret_new", stripeAccountId: null });
    const payment = await prisma.payment.findUniqueOrThrow({ where: { stripePaymentIntentId: "pi_new" } });
    expect(payment.status).toBe("PENDING");
    expect(payment.amount.toString()).toBe("23.19");
    // No account of its own on a single-business deployment: the platform's, named as such.
    expect(payment.stripeAccountId).toBeNull();
    expect(createSpy.mock.calls[0][1]).toEqual({ idempotencyKey: `pi_create_${order.id}_platform_2319` });
  });

  it("reuses an existing open intent instead of creating a second one", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const order = await makeOrder(business.id, { total: "23.19" });
    await prisma.payment.create({
      data: {
        businessId: business.id,
        orderId: order.id,
        provider: "STRIPE",
        status: "PENDING",
        amount: "23.19",
        stripePaymentIntentId: "pi_existing",
      },
    });
    vi.spyOn(stripe.paymentIntents, "retrieve").mockResolvedValue({
      status: "requires_payment_method",
      amount: 2319,
      client_secret: "secret_existing",
    } as never);
    const createSpy = vi.spyOn(stripe.paymentIntents, "create");

    const result = await createPaymentIntentAction(order.publicToken);

    expect(result).toEqual({ ok: true, clientSecret: "secret_existing", stripeAccountId: null });
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("updates the existing intent's amount when the order's total changed since it was created", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const order = await makeOrder(business.id, { total: "30.00" });
    const payment = await prisma.payment.create({
      data: {
        businessId: business.id,
        orderId: order.id,
        provider: "STRIPE",
        status: "PENDING",
        amount: "23.19",
        stripePaymentIntentId: "pi_stale_amount",
      },
    });
    vi.spyOn(stripe.paymentIntents, "retrieve").mockResolvedValue({
      status: "requires_payment_method",
      amount: 2319, // the stale amount — order.total is now 30.00
      client_secret: "secret_existing",
    } as never);
    vi.spyOn(stripe.paymentIntents, "update").mockResolvedValue({ client_secret: "secret_updated" } as never);

    const result = await createPaymentIntentAction(order.publicToken);

    expect(result).toEqual({ ok: true, clientSecret: "secret_updated", stripeAccountId: null });
    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.amount.toString()).toBe("30");
  });

  it("reports try_again when updating the stale intent's amount fails", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const order = await makeOrder(business.id, { total: "30.00" });
    await prisma.payment.create({
      data: {
        businessId: business.id,
        orderId: order.id,
        provider: "STRIPE",
        status: "PENDING",
        amount: "23.19",
        stripePaymentIntentId: "pi_stale_amount_fails",
      },
    });
    vi.spyOn(stripe.paymentIntents, "retrieve").mockResolvedValue({
      status: "requires_payment_method",
      amount: 2319,
      client_secret: "secret_existing",
    } as never);
    vi.spyOn(stripe.paymentIntents, "update").mockRejectedValue(new Error("stripe is down"));

    const result = await createPaymentIntentAction(order.publicToken);

    expect(result).toEqual({ ok: false, error: "try_again" });
  });

  it("two concurrent calls sharing Stripe's idempotent response both succeed, only one Payment row is created", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const order = await makeOrder(business.id, { total: "23.19" });
    // Simulates Stripe's own idempotency key behavior: two concurrent
    // requests under the same key get back the same intent.
    vi.spyOn(stripe.paymentIntents, "create").mockResolvedValue({
      id: "pi_shared",
      client_secret: "secret_shared",
    } as never);

    const results = await runConcurrently([
      () => createPaymentIntentAction(order.publicToken),
      () => createPaymentIntentAction(order.publicToken),
    ]);
    const { fulfilled } = partitionSettled(results);

    expect(fulfilled).toHaveLength(2);
    expect(fulfilled.every((r) => r.ok)).toBe(true);
    const paymentCount = await prisma.payment.count({ where: { stripePaymentIntentId: "pi_shared" } });
    expect(paymentCount).toBe(1);
  });

  it("reports rate_limited once this IP's intent attempts exceed the cap", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const order = await makeOrder(business.id, { total: "23.19" });
    await prisma.rateLimitCounter.createMany({
      data: Array.from({ length: 10 }, () => ({ scope: "payment:intent", key: "unknown" })),
    });

    const result = await createPaymentIntentAction(order.publicToken);

    expect(result).toEqual({ ok: false, error: "rate_limited" });
  });
});

describe("createPaymentIntentAction on a connected account", () => {
  const connected = { stripeAccountId: "acct_mine", stripeCardPaymentsStatus: "ACTIVE" as const, acceptsOnlinePayment: true };

  async function connectedBusiness() {
    const business = await makeBusiness({ slug: "marea", ...connected });
    await makeBusiness({ slug: "cala", stripeAccountId: "acct_other", stripeCardPaymentsStatus: "ACTIVE" as const });
    setTestHost("marea.localhost:3000");
    return business;
  }

  it("charges on the business's account, records it on the payment, and hands it back for Stripe.js", async () => {
    const business = await connectedBusiness();
    const order = await makeOrder(business.id, { total: "23.19" });
    const createSpy = vi.spyOn(stripe.paymentIntents, "create").mockResolvedValue({ id: "pi_c", client_secret: "secret_c" } as never);

    const result = await createPaymentIntentAction(order.publicToken);

    expect(result).toEqual({ ok: true, clientSecret: "secret_c", stripeAccountId: "acct_mine" });
    const [params, options] = createSpy.mock.calls[0];
    expect(params).toMatchObject({ amount: 2319, metadata: { businessId: business.id } });
    expect(options).toEqual({ stripeAccount: "acct_mine", idempotencyKey: `pi_create_${order.id}_acct_mine_2319` });
    // No platform fee: neither a fee nor a transfer of any kind is asked of Stripe.
    expect(params).not.toHaveProperty("application_fee_amount");
    expect(params).not.toHaveProperty("transfer_data");
    expect(params).not.toHaveProperty("on_behalf_of");
    expect((await prisma.payment.findUniqueOrThrow({ where: { stripePaymentIntentId: "pi_c" } })).stripeAccountId).toBe("acct_mine");
  });

  it("charges nothing while the account is not active, even to the platform", async () => {
    const business = await makeBusiness({ slug: "marea", ...connected, stripeCardPaymentsStatus: "PENDING" });
    const order = await makeOrder(business.id, { total: "23.19" });
    const createSpy = vi.spyOn(stripe.paymentIntents, "create");

    expect(await createPaymentIntentAction(order.publicToken)).toEqual({ ok: false, error: "online_payment_disabled" });
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("reads, updates and reuses an open intent on the account stored on its payment", async () => {
    const business = await connectedBusiness();
    const order = await makeOrder(business.id, { total: "30.00" });
    await prisma.payment.create({
      data: { businessId: business.id, orderId: order.id, provider: "STRIPE", status: "PENDING", amount: "23.19", stripePaymentIntentId: "pi_open", stripeAccountId: "acct_mine" },
    });
    const retrieveSpy = vi.spyOn(stripe.paymentIntents, "retrieve").mockResolvedValue({ id: "pi_open", status: "requires_payment_method", amount: 2319, client_secret: "s" } as never);
    const updateSpy = vi.spyOn(stripe.paymentIntents, "update").mockResolvedValue({ client_secret: "s2" } as never);
    const createSpy = vi.spyOn(stripe.paymentIntents, "create");

    const result = await createPaymentIntentAction(order.publicToken);

    expect(result).toEqual({ ok: true, clientSecret: "s2", stripeAccountId: "acct_mine" });
    expect(retrieveSpy).toHaveBeenCalledWith("pi_open", {}, { stripeAccount: "acct_mine" });
    expect(updateSpy).toHaveBeenCalledWith("pi_open", { amount: 3000 }, { stripeAccount: "acct_mine" });
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("does not reuse an intent left on the platform's account: it makes a new one on the business's and cancels the old", async () => {
    const business = await connectedBusiness();
    const order = await makeOrder(business.id, { total: "23.19" });
    await prisma.payment.create({
      data: { businessId: business.id, orderId: order.id, provider: "STRIPE", status: "PENDING", amount: "23.19", stripePaymentIntentId: "pi_platform" },
    });
    const retrieveSpy = vi.spyOn(stripe.paymentIntents, "retrieve");
    const cancelSpy = vi.spyOn(stripe.paymentIntents, "cancel").mockResolvedValue({} as never);
    const createSpy = vi.spyOn(stripe.paymentIntents, "create").mockResolvedValue({ id: "pi_new_c", client_secret: "sc" } as never);

    const result = await createPaymentIntentAction(order.publicToken);

    expect(result).toEqual({ ok: true, clientSecret: "sc", stripeAccountId: "acct_mine" });
    expect(retrieveSpy).not.toHaveBeenCalled();
    // The old intent is cancelled where it lives: no account header, the platform's.
    expect(cancelSpy).toHaveBeenCalledWith("pi_platform", {}, {});
    expect(createSpy.mock.calls[0][1]).toMatchObject({ stripeAccount: "acct_mine" });
    expect((await prisma.payment.findUniqueOrThrow({ where: { stripePaymentIntentId: "pi_platform" } })).stripeAccountId).toBeNull();
  });

  it("cancels the just-created intent on its own account when the order was cancelled meanwhile", async () => {
    const business = await connectedBusiness();
    const order = await makeOrder(business.id, { total: "23.19" });
    vi.spyOn(stripe.paymentIntents, "create").mockImplementation((async () => {
      await prisma.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
      return { id: "pi_late", client_secret: "sl" };
    }) as never);
    const cancelSpy = vi.spyOn(stripe.paymentIntents, "cancel").mockResolvedValue({} as never);

    expect(await createPaymentIntentAction(order.publicToken)).toEqual({ ok: false, error: "order_cancelled" });
    expect(cancelSpy).toHaveBeenCalledWith("pi_late", {}, { stripeAccount: "acct_mine" });
  });
});
