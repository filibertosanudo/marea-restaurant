import { describe, it, expect, vi, afterEach } from "vitest";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe/client";
import { onlinePaymentAvailability } from "@/lib/payments/availability";
import { createPaymentIntentAction } from "@/lib/payments/stripe-actions";
import * as businessModule from "@/lib/business";
import { setTestHost } from "@/test/stubs/next-headers";
import { makeBusiness, makeOrder } from "@/test/factories";
import { POST } from "./route";
import { POST as platformPOST } from "../route";

process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_connect_secret";
process.env.BUSINESS_ROOT_DOMAIN = "localhost";

const ACCOUNT = "acct_mine";

function signed(event: object, secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET!, path = "connect") {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return new Request(`http://localhost/api/webhooks/stripe/${path}`, { method: "POST", headers: { "stripe-signature": signature }, body: payload });
}

let sequence = 0;
function event(type: string, object: object, extra: object = {}) {
  sequence += 1;
  return { id: `evt_connect_${sequence}`, object: "event", type, livemode: false, account: ACCOUNT, data: { object }, ...extra };
}
const intentEvent = (type: string, intentId: string, extra: object = {}) =>
  event(type, { id: intentId, object: "payment_intent" }, extra);

async function paymentOn(businessId: string, intentId: string, stripeAccountId: string | null = ACCOUNT) {
  const order = await makeOrder(businessId);
  return prisma.payment.create({
    data: { businessId, orderId: order.id, provider: "STRIPE", status: "PENDING", amount: "23.19", stripePaymentIntentId: intentId, stripeAccountId },
  });
}
const statusOf = async (id: string) => (await prisma.payment.findUniqueOrThrow({ where: { id } })).status;

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(revalidateTag).mockClear();
});

describe("POST /api/webhooks/stripe/connect: signatures and scope", () => {
  it("rejects a missing signature and a bad one", async () => {
    expect((await POST(new Request("http://localhost/x", { method: "POST", body: "{}" }))).status).toBe(400);
    expect((await POST(signed(intentEvent("payment_intent.succeeded", "pi_x"), "whsec_wrong"))).status).toBe(400);
  });

  it("rejects an event signed with the platform's secret, and the platform endpoint rejects the Connect one", async () => {
    const business = await makeBusiness();
    const payment = await paymentOn(business.id, "pi_secrets");

    expect((await POST(signed(intentEvent("payment_intent.succeeded", "pi_secrets"), "whsec_test_secret"))).status).toBe(400);
    expect((await platformPOST(signed(intentEvent("payment_intent.succeeded", "pi_secrets"), "whsec_connect_secret", ""))).status).toBe(400);
    expect(await statusOf(payment.id)).toBe("PENDING");
  });

  it("ignores, with a 2xx and no change, an event that carries no account", async () => {
    const business = await makeBusiness();
    const payment = await paymentOn(business.id, "pi_noacct", null);
    const bare = intentEvent("payment_intent.succeeded", "pi_noacct", { account: undefined }); // JSON drops it

    expect((await POST(signed(bare))).status).toBe(200);

    expect(await statusOf(payment.id)).toBe("PENDING");
    expect(await prisma.stripeWebhookEvent.count()).toBe(0);
  });

  it("ignores an event of the other mode than the key's", async () => {
    const business = await makeBusiness();
    const payment = await paymentOn(business.id, "pi_live");

    expect((await POST(signed(intentEvent("payment_intent.succeeded", "pi_live", { livemode: true })))).status).toBe(200);

    expect(await statusOf(payment.id)).toBe("PENDING");
    expect(await prisma.stripeWebhookEvent.count()).toBe(0);
  });
});

describe("POST /api/webhooks/stripe/connect: payments", () => {
  it("applies a succeeded payment made on the account, reading its charge on that account", async () => {
    const business = await makeBusiness();
    const payment = await paymentOn(business.id, "pi_ok");
    const retrieve = vi.spyOn(stripe.charges, "retrieve").mockResolvedValue({ id: "ch_ok", payment_method_details: { card: { brand: "visa", last4: "4242" } }, receipt_url: null } as never);

    const response = await POST(signed(event("payment_intent.succeeded", { id: "pi_ok", object: "payment_intent", latest_charge: "ch_ok" })));

    expect(response.status).toBe(200);
    expect(await statusOf(payment.id)).toBe("SUCCEEDED");
    expect(retrieve).toHaveBeenCalledWith("ch_ok", {}, { stripeAccount: ACCOUNT });
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).paymentMethodLast4).toBe("4242");
  });

  it("lists a charge's refunds on the account the event came from", async () => {
    const business = await makeBusiness();
    const payment = await paymentOn(business.id, "pi_refund");
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "SUCCEEDED" } });
    const list = vi.spyOn(stripe.refunds, "list").mockReturnValue({
      autoPagingToArray: async () => [{ id: "re_c", amount: 500, status: "succeeded" }],
    } as unknown as ReturnType<typeof stripe.refunds.list>);

    const charge = { id: "ch_r", object: "charge", payment_intent: "pi_refund", amount: 2319, amount_refunded: 500, currency: "mxn" };
    expect((await POST(signed(event("charge.refunded", charge)))).status).toBe(200);

    expect(list).toHaveBeenCalledWith({ charge: "ch_r" }, { stripeAccount: ACCOUNT });
    expect(await statusOf(payment.id)).toBe("PARTIALLY_REFUNDED");
  });

  it("does not apply an event whose account is not the one the payment was charged on", async () => {
    const business = await makeBusiness();
    const payment = await paymentOn(business.id, "pi_other");
    const retrieve = vi.spyOn(stripe.charges, "retrieve");

    expect((await POST(signed(intentEvent("payment_intent.succeeded", "pi_other", { account: "acct_someone_else" })))).status).toBe(200);

    expect(await statusOf(payment.id)).toBe("PENDING");
    expect(await prisma.stripeWebhookEvent.count()).toBe(0);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("does not apply an event for a payment taken on the platform's account", async () => {
    const business = await makeBusiness();
    const payment = await paymentOn(business.id, "pi_platform_owned", null);

    expect((await POST(signed(intentEvent("payment_intent.succeeded", "pi_platform_owned")))).status).toBe(200);

    expect(await statusOf(payment.id)).toBe("PENDING");
    expect(await prisma.stripeWebhookEvent.count()).toBe(0);
  });

  it("applies an event for another business's payment to that business only", async () => {
    const mine = await makeBusiness({ slug: "marea" });
    const theirs = await makeBusiness({ slug: "cala" });
    const a = await paymentOn(mine.id, "pi_a", "acct_a");
    const b = await paymentOn(theirs.id, "pi_b", "acct_b");

    await POST(signed(intentEvent("payment_intent.succeeded", "pi_a", { account: "acct_a" })));
    // acct_a's event naming b's intent is refused, not applied to either.
    await POST(signed(intentEvent("payment_intent.succeeded", "pi_b", { account: "acct_a" })));

    expect(await statusOf(a.id)).toBe("SUCCEEDED");
    expect(await statusOf(b.id)).toBe("PENDING");
  });

  it("answers 2xx and records only the event for a payment it never created", async () => {
    await makeBusiness();
    expect((await POST(signed(intentEvent("payment_intent.succeeded", "pi_never_seen")))).status).toBe(200);
    expect(await prisma.stripeWebhookEvent.count()).toBe(1);
  });

  it("applies a redelivered event once", async () => {
    const business = await makeBusiness();
    const payment = await paymentOn(business.id, "pi_twice");
    const body = intentEvent("payment_intent.succeeded", "pi_twice");

    expect((await POST(signed(body))).status).toBe(200);
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "PENDING" } });
    expect((await POST(signed(body))).status).toBe(200);

    expect(await statusOf(payment.id)).toBe("PENDING"); // the second delivery changed nothing
    expect(await prisma.stripeWebhookEvent.count()).toBe(1);
  });

  it("keeps event ids unique across both endpoints: one index, one row per id", async () => {
    await prisma.stripeWebhookEvent.create({ data: { eventId: "evt_shared", type: "x", payload: {} } });
    await expect(prisma.stripeWebhookEvent.create({ data: { eventId: "evt_shared", type: "y", payload: {} } })).rejects.toThrow();
  });
});

describe("account.updated", () => {
  const accountEvent = (extra: object = {}, capability = "active") =>
    event("account.updated", { id: ACCOUNT, object: "account", capabilities: { card_payments: capability } }, extra);
  const reads = (status: string, livemode = false) =>
    vi.spyOn(stripe.v2.core.accounts, "retrieve").mockResolvedValue({
      id: ACCOUNT,
      livemode,
      closed: false,
      configuration: { merchant: { capabilities: { card_payments: { status } } } },
    } as never);
  const connected = (over: Record<string, unknown> = {}) =>
    makeBusiness({ slug: "marea", stripeAccountId: ACCOUNT, stripeCardPaymentsStatus: "ACTIVE", acceptsOnlinePayment: true, ...over });
  const stored = (id: string) => prisma.business.findUniqueOrThrow({ where: { id } });

  it("turns cards off, without anyone opening the settings, when the account becomes restricted", async () => {
    const business = await connected();
    reads("restricted");

    expect((await POST(signed(accountEvent({}, "inactive")))).status).toBe(200);

    const row = await stored(business.id);
    expect(row.stripeCardPaymentsStatus).toBe("RESTRICTED");
    expect(row.stripeStatusCheckedAt).not.toBeNull();
    expect(revalidateTag).toHaveBeenCalled();
    expect(await onlinePaymentAvailability(row)).toEqual({ allowed: false, reason: "account_not_active" });
  });

  it("records an account that became active, from Stripe's answer and not from the event's word", async () => {
    const business = await connected({ stripeCardPaymentsStatus: "PENDING" });
    const read = reads("active");

    await POST(signed(accountEvent()));

    expect((await stored(business.id)).stripeCardPaymentsStatus).toBe("ACTIVE");
    expect(read).toHaveBeenCalledWith(ACCOUNT, expect.anything());
  });

  it("fails safe when the account cannot be read: an inactive capability turns cards off", async () => {
    const business = await connected();
    vi.spyOn(stripe.v2.core.accounts, "retrieve").mockRejectedValue(new Error("stripe is down"));

    expect((await POST(signed(accountEvent({}, "inactive")))).status).toBe(200);

    expect((await stored(business.id)).stripeCardPaymentsStatus).toBe("RESTRICTED");
  });

  it("does not take an event's word for 'active' when it cannot be confirmed", async () => {
    const business = await connected({ stripeCardPaymentsStatus: "PENDING" });
    vi.spyOn(stripe.v2.core.accounts, "retrieve").mockRejectedValue(new Error("stripe is down"));

    await POST(signed(accountEvent({}, "active")));

    expect((await stored(business.id)).stripeCardPaymentsStatus).toBe("PENDING");
  });

  it("trusts neither the event nor the read when they are of different modes", async () => {
    const business = await connected();
    reads("restricted", true);

    await POST(signed(accountEvent()));

    expect((await stored(business.id)).stripeCardPaymentsStatus).toBe("ACTIVE");
  });

  it("changes nothing for an account no business holds", async () => {
    const business = await connected();
    const read = reads("restricted");

    expect((await POST(signed(accountEvent({ account: "acct_unknown" })))).status).toBe(200);

    expect(read).not.toHaveBeenCalled();
    expect((await stored(business.id)).stripeCardPaymentsStatus).toBe("ACTIVE");
  });

  it("applies a redelivery once", async () => {
    const business = await connected();
    reads("restricted");
    const body = accountEvent();

    await POST(signed(body));
    await prisma.business.update({ where: { id: business.id }, data: { stripeCardPaymentsStatus: "ACTIVE" } });
    await POST(signed(body));

    expect((await stored(business.id)).stripeCardPaymentsStatus).toBe("ACTIVE");
  });

  it("is refused on the platform endpoint", async () => {
    const business = await connected();
    reads("restricted");

    expect((await platformPOST(signed(accountEvent(), "whsec_test_secret", ""))).status).toBe(200);

    expect((await stored(business.id)).stripeCardPaymentsStatus).toBe("ACTIVE");
  });
});

describe("account.application.deauthorized", () => {
  const deauthorized = (extra: object = {}) => event("account.application.deauthorized", { id: ACCOUNT, object: "application" }, extra);
  const connected = () =>
    makeBusiness({ slug: "marea", stripeAccountId: ACCOUNT, stripeCardPaymentsStatus: "ACTIVE", acceptsOnlinePayment: true });

  it("stops the business charging: the account is cleared, cards are off, and it does not fall back to the platform's key", async () => {
    const business = await connected();

    expect((await POST(signed(deauthorized()))).status).toBe(200);

    const row = await prisma.business.findUniqueOrThrow({ where: { id: business.id } });
    expect(row).toMatchObject({ stripeAccountId: null, stripeCardPaymentsStatus: "RESTRICTED", acceptsOnlinePayment: false });
    expect(revalidateTag).toHaveBeenCalled();
    // The only business on the deployment, and still no card: it had connected an account.
    expect(await onlinePaymentAvailability(row)).toEqual({ allowed: false, reason: "account_not_active" });
    // Even if the switch is turned back on by hand.
    await prisma.business.update({ where: { id: business.id }, data: { acceptsOnlinePayment: true } });
    setTestHost("marea.localhost:3000");
    const order = await makeOrder(business.id, { total: "23.19" });
    const create = vi.spyOn(stripe.paymentIntents, "create");
    expect(await createPaymentIntentAction(order.publicToken)).toEqual({ ok: false, error: "online_payment_disabled" });
    expect(create).not.toHaveBeenCalled();
  });

  it("charges nothing even when the public cache still shows the old account", async () => {
    const business = await connected();
    const stale = await businessModule.getPublicBusiness();
    await POST(signed(deauthorized()));
    await prisma.business.update({ where: { id: business.id }, data: { acceptsOnlinePayment: true } });
    vi.spyOn(businessModule, "getPublicBusiness").mockResolvedValue(stale);
    setTestHost("marea.localhost:3000");
    const order = await makeOrder(business.id, { total: "23.19" });
    const create = vi.spyOn(stripe.paymentIntents, "create");

    expect(await createPaymentIntentAction(order.publicToken)).toEqual({ ok: false, error: "online_payment_disabled" });
    expect(create).not.toHaveBeenCalled();
  });

  it("leaves its old payments their account, so their later events and refunds still find them", async () => {
    const business = await connected();
    const payment = await paymentOn(business.id, "pi_old");
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "SUCCEEDED" } });
    await POST(signed(deauthorized()));
    vi.spyOn(stripe.refunds, "list").mockReturnValue({
      autoPagingToArray: async () => [{ id: "re_late", amount: 2319, status: "succeeded" }],
    } as unknown as ReturnType<typeof stripe.refunds.list>);

    const charge = { id: "ch_old", object: "charge", payment_intent: "pi_old", amount: 2319, amount_refunded: 2319, currency: "mxn" };
    await POST(signed(event("charge.refunded", charge)));

    const row = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(row.stripeAccountId).toBe(ACCOUNT);
    expect(row.status).toBe("REFUNDED");
  });

  it("does not take away an account the business has connected since", async () => {
    const business = await makeBusiness({ slug: "marea", stripeAccountId: "acct_new", stripeCardPaymentsStatus: "ACTIVE", acceptsOnlinePayment: true });

    expect((await POST(signed(deauthorized()))).status).toBe(200);

    expect(await prisma.business.findUniqueOrThrow({ where: { id: business.id } })).toMatchObject({ stripeAccountId: "acct_new", acceptsOnlinePayment: true });
  });

  it("applies a redelivery once", async () => {
    const business = await connected();
    const body = deauthorized();
    await POST(signed(body));
    await prisma.business.update({ where: { id: business.id }, data: { stripeAccountId: ACCOUNT, stripeCardPaymentsStatus: "ACTIVE" } });

    await POST(signed(body));

    expect((await prisma.business.findUniqueOrThrow({ where: { id: business.id } })).stripeAccountId).toBe(ACCOUNT);
  });
});
