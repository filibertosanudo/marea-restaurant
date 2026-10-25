import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import pg from "pg";
import type Stripe from "stripe";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { stripe } from "@/lib/stripe/client";
import { testSchema } from "@/test/db";
import { POST } from "./route";
import { POST as connectPOST } from "./connect/route";

// The platform's billing events, through the real route as it runs in
// production: no host, no session, the route's own `prisma` connected as
// marea_app. The organization is found from the event's customer account
// (lib/tenancy/discover.ts, as marea_worker) and the mirror is written inside
// its first business. Stripe's retrieve is the only thing faked; rows are
// arranged, and checked, as the owner.

function urlAs(role: string): string {
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("options", `-c search_path=${testSchema} -c role=${role}`);
  return url.toString();
}

process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_connect_secret";
process.env.WORKER_DATABASE_URL = urlAs("marea_worker");

vi.mock("@/lib/prisma", async () => {
  const { TenantPool } = await import("@/lib/db/tenant-pool");
  const { explicitTenant } = await import("@/lib/tenancy/context");
  const pool = new TenantPool({ connectionString: urlAs("marea_app"), max: 3 }, () => explicitTenant());
  return { prisma: new PrismaClient({ adapter: new PrismaPg(pool, { schema: testSchema }) }) };
});

const ownerPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const owner = new PrismaClient({ adapter: new PrismaPg(ownerPool, { schema: testSchema }) });

afterAll(async () => {
  await owner.$disconnect();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function signed(event: object, secret = process.env.STRIPE_WEBHOOK_SECRET!, path = "/api/webhooks/stripe") {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return new Request(`http://localhost${path}`, { method: "POST", headers: { "stripe-signature": signature }, body: payload });
}

let sequence = 0;
function event(type: string, object: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  sequence += 1;
  return { id: `evt_billing_${sequence}_${Math.random().toString(36).slice(2, 8)}`, object: "event", type, livemode: false, data: { object }, ...extra };
}

function stripeSubscription(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: "sub_x",
    object: "subscription",
    status: "trialing",
    trial_end: 1_794_127_307,
    cancel_at_period_end: false,
    default_payment_method: null,
    customer: { id: "cus_x", object: "customer", invoice_settings: { default_payment_method: null } },
    customer_account: "acct_x",
    items: { data: [{ quantity: 1, current_period_end: 1_794_127_307, price: { lookup_key: "marea_basico" } }] },
    latest_invoice: null,
    ...overrides,
  } as unknown as Stripe.Subscription;
}

async function subscribedOrganization() {
  const suffix = Math.random().toString(36).slice(2, 8);
  const organization = await owner.organization.create({ data: { name: `Org ${suffix}`, slug: `org-${suffix}`, verifiedAt: new Date() } });
  await owner.business.create({ data: { name: "Branch", slug: `b-${suffix}`, organizationId: organization.id } });
  const ids = { accountId: `acct_${suffix}`, subscriptionId: `sub_${suffix}` };
  await owner.organizationSubscription.create({
    data: { organizationId: organization.id, stripeCustomerAccountId: ids.accountId, stripeSubscriptionId: ids.subscriptionId, status: "TRIALING", planLookupKey: "marea_basico" },
  });
  return { organization, ...ids };
}

const rowOf = (organizationId: string) => owner.organizationSubscription.findUniqueOrThrow({ where: { organizationId } });

describe("POST /api/webhooks/stripe, billing events", () => {
  it("rewrites the mirror from a fresh retrieve, not from the payload the event carried", async () => {
    const org = await subscribedOrganization();
    const retrieve = vi
      .spyOn(stripe.subscriptions, "retrieve")
      .mockResolvedValue(stripeSubscription({ id: org.subscriptionId, customer_account: org.accountId, status: "active", trial_end: null }) as never);

    // A stale payload that still says "trialing": what Stripe says now wins.
    const response = await POST(signed(event("customer.subscription.updated", { id: org.subscriptionId, object: "subscription", customer_account: org.accountId, status: "trialing" })));

    expect(response.status).toBe(200);
    expect(retrieve).toHaveBeenCalledWith(org.subscriptionId, { expand: ["customer"] });
    expect(await rowOf(org.organization.id)).toMatchObject({ status: "ACTIVE", trialEndsAt: null });
    expect((await rowOf(org.organization.id)).syncedAt).not.toBeNull();
  });

  it("applies a redelivered event once", async () => {
    const org = await subscribedOrganization();
    const retrieve = vi.spyOn(stripe.subscriptions, "retrieve").mockResolvedValue(stripeSubscription({ id: org.subscriptionId, status: "past_due" }) as never);
    const evt = event("invoice.payment_failed", { id: "in_1", object: "invoice", customer_account: org.accountId, parent: { subscription_details: { subscription: org.subscriptionId } } });

    expect((await POST(signed(evt))).status).toBe(200);
    expect((await POST(signed(evt))).status).toBe(200);

    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(await owner.stripeWebhookEvent.count({ where: { eventId: evt.id } })).toBe(1);
    expect((await rowOf(org.organization.id)).status).toBe("PAST_DUE");
  });

  it("ignores, with a 2xx and no write, an event for a customer account no organization holds", async () => {
    const retrieve = vi.spyOn(stripe.subscriptions, "retrieve");
    const evt = event("customer.subscription.updated", { id: "sub_unknown", object: "subscription", customer_account: "acct_nobody" });

    const response = await POST(signed(evt));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ignored: true });
    expect(retrieve).not.toHaveBeenCalled();
    expect(await owner.stripeWebhookEvent.count({ where: { eventId: evt.id } })).toBe(0);
  });

  it("ignores an event whose subscription is not the one stored for that customer account", async () => {
    const org = await subscribedOrganization();
    const retrieve = vi.spyOn(stripe.subscriptions, "retrieve");

    const response = await POST(signed(event("customer.subscription.deleted", { id: "sub_someone_else", object: "subscription", customer_account: org.accountId })));

    expect(await response.json()).toMatchObject({ ignored: true });
    expect(retrieve).not.toHaveBeenCalled();
    expect((await rowOf(org.organization.id)).status).toBe("TRIALING");
  });

  it("puts the card from a completed setup session on a paused subscription, resumes it and pays its invoice", async () => {
    const org = await subscribedOrganization();
    await owner.organizationSubscription.update({ where: { organizationId: org.organization.id }, data: { status: "PAUSED" } });
    vi.spyOn(stripe.setupIntents, "retrieve").mockResolvedValue({ id: "seti_1", payment_method: "pm_card" } as never);
    const retrieve = vi
      .spyOn(stripe.subscriptions, "retrieve")
      .mockResolvedValueOnce(stripeSubscription({ id: org.subscriptionId, status: "paused" }) as never)
      .mockResolvedValueOnce(stripeSubscription({ id: org.subscriptionId, status: "active", trial_end: null, default_payment_method: "pm_card" }) as never);
    const update = vi.spyOn(stripe.subscriptions, "update").mockResolvedValue({} as never);
    const resume = vi.spyOn(stripe.subscriptions, "resume").mockResolvedValue(stripeSubscription({ id: org.subscriptionId, latest_invoice: "in_resume" }) as never);
    const pay = vi.spyOn(stripe.invoices, "pay").mockResolvedValue({ status: "paid" } as never);

    const response = await POST(signed(event("checkout.session.completed", { id: "cs_1", object: "checkout.session", mode: "setup", customer_account: org.accountId, setup_intent: "seti_1" })));

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(org.subscriptionId, { default_payment_method: "pm_card" });
    expect(resume).toHaveBeenCalledWith(org.subscriptionId, { billing_cycle_anchor: "now" });
    expect(pay).toHaveBeenCalledWith("in_resume", { payment_method: "pm_card" });
    expect(retrieve).toHaveBeenCalledTimes(2);
    expect(await rowOf(org.organization.id)).toMatchObject({ status: "ACTIVE", hasPaymentMethod: true });
  });

  it("does not resume a subscription that is still in its trial when a card is added", async () => {
    const org = await subscribedOrganization();
    vi.spyOn(stripe.setupIntents, "retrieve").mockResolvedValue({ id: "seti_2", payment_method: "pm_card" } as never);
    vi.spyOn(stripe.subscriptions, "retrieve").mockResolvedValue(stripeSubscription({ id: org.subscriptionId, status: "trialing", default_payment_method: "pm_card" }) as never);
    vi.spyOn(stripe.subscriptions, "update").mockResolvedValue({} as never);
    const resume = vi.spyOn(stripe.subscriptions, "resume");

    await POST(signed(event("checkout.session.completed", { id: "cs_2", object: "checkout.session", mode: "setup", customer_account: org.accountId, setup_intent: "seti_2" })));

    expect(resume).not.toHaveBeenCalled();
    expect(await rowOf(org.organization.id)).toMatchObject({ status: "TRIALING", hasPaymentMethod: true });
  });

  it("brings a per-branch subscription's quantity to the organization's branch count", async () => {
    const org = await subscribedOrganization();
    await owner.business.create({ data: { name: "Second", slug: `second-${org.accountId}`, organizationId: org.organization.id } });
    const cadena = stripeSubscription({
      id: org.subscriptionId,
      status: "active",
      items: { data: [{ id: "si_1", quantity: 1, current_period_end: 1_794_127_307, price: { lookup_key: "marea_cadena" } }] },
    });
    vi.spyOn(stripe.subscriptions, "retrieve").mockResolvedValue(cadena as never);
    const update = vi.spyOn(stripe.subscriptions, "update").mockResolvedValue({} as never);

    await POST(signed(event("customer.subscription.updated", { id: org.subscriptionId, object: "subscription", customer_account: org.accountId })));

    expect(update).toHaveBeenCalledWith(org.subscriptionId, { items: [{ id: "si_1", quantity: 2 }], proration_behavior: "create_prorations" });
  });

  it("leaves the quantity of a one-branch plan alone", async () => {
    const org = await subscribedOrganization();
    await owner.business.create({ data: { name: "Second", slug: `second-${org.accountId}`, organizationId: org.organization.id } });
    vi.spyOn(stripe.subscriptions, "retrieve").mockResolvedValue(stripeSubscription({ id: org.subscriptionId, status: "active" }) as never);
    const update = vi.spyOn(stripe.subscriptions, "update");

    await POST(signed(event("customer.subscription.updated", { id: org.subscriptionId, object: "subscription", customer_account: org.accountId })));

    expect(update).not.toHaveBeenCalled();
  });

  it("starts the degrade clock at the first unpaid status, keeps it, and clears it on payment", async () => {
    const org = await subscribedOrganization();
    const retrieve = vi.spyOn(stripe.subscriptions, "retrieve");
    const invoice = (type: string) =>
      event(type, { id: `in_${type}`, object: "invoice", customer_account: org.accountId, parent: { subscription_details: { subscription: org.subscriptionId } } });

    retrieve.mockResolvedValueOnce(stripeSubscription({ id: org.subscriptionId, status: "past_due" }) as never);
    await POST(signed(invoice("invoice.payment_failed")));
    const started = (await rowOf(org.organization.id)).lapsedSince;
    expect(started).not.toBeNull();

    retrieve.mockResolvedValueOnce(stripeSubscription({ id: org.subscriptionId, status: "unpaid" }) as never);
    await POST(signed(event("customer.subscription.updated", { id: org.subscriptionId, object: "subscription", customer_account: org.accountId })));
    expect((await rowOf(org.organization.id)).lapsedSince).toEqual(started);

    retrieve.mockResolvedValueOnce(stripeSubscription({ id: org.subscriptionId, status: "active", trial_end: null }) as never);
    await POST(signed(invoice("invoice.paid")));
    expect(await rowOf(org.organization.id)).toMatchObject({ status: "ACTIVE", lapsedSince: null });
  });

  it("pays the open invoice of a past-due subscription with the card a setup session added", async () => {
    const org = await subscribedOrganization();
    vi.spyOn(stripe.setupIntents, "retrieve").mockResolvedValue({ id: "seti_3", payment_method: "pm_new" } as never);
    vi.spyOn(stripe.subscriptions, "retrieve")
      .mockResolvedValueOnce(stripeSubscription({ id: org.subscriptionId, status: "past_due", latest_invoice: "in_overdue" }) as never)
      .mockResolvedValueOnce(stripeSubscription({ id: org.subscriptionId, status: "active", trial_end: null, default_payment_method: "pm_new" }) as never);
    vi.spyOn(stripe.subscriptions, "update").mockResolvedValue({} as never);
    const pay = vi.spyOn(stripe.invoices, "pay").mockResolvedValue({ status: "paid" } as never);

    await POST(signed(event("checkout.session.completed", { id: "cs_3", object: "checkout.session", mode: "setup", customer_account: org.accountId, setup_intent: "seti_3" })));

    expect(pay).toHaveBeenCalledWith("in_overdue", { payment_method: "pm_new" });
    expect(await rowOf(org.organization.id)).toMatchObject({ status: "ACTIVE", lapsedSince: null });
  });

  it("adopts the new subscription of an organization whose old one ended", async () => {
    const org = await subscribedOrganization();
    await owner.organizationSubscription.update({ where: { organizationId: org.organization.id }, data: { status: "CANCELED", lapsedSince: new Date() } });
    const retrieve = vi.spyOn(stripe.subscriptions, "retrieve").mockResolvedValue(stripeSubscription({ id: "sub_new", status: "active", trial_end: null }) as never);

    await POST(signed(event("checkout.session.completed", { id: "cs_4", object: "checkout.session", mode: "subscription", customer_account: org.accountId, subscription: "sub_new" })));

    expect(retrieve).toHaveBeenCalledWith("sub_new", { expand: ["customer"] });
    expect(await rowOf(org.organization.id)).toMatchObject({ stripeSubscriptionId: "sub_new", status: "ACTIVE", lapsedSince: null });
  });

  it("never swaps a subscription that is still running", async () => {
    const org = await subscribedOrganization();
    const retrieve = vi.spyOn(stripe.subscriptions, "retrieve");

    const response = await POST(signed(event("checkout.session.completed", { id: "cs_5", object: "checkout.session", mode: "subscription", customer_account: org.accountId, subscription: "sub_second" })));

    expect(await response.json()).toMatchObject({ ignored: true });
    expect(retrieve).not.toHaveBeenCalled();
    expect((await rowOf(org.organization.id)).stripeSubscriptionId).toBe(org.subscriptionId);
  });

  it("refuses a billing event on the Connect endpoint", async () => {
    const org = await subscribedOrganization();
    const retrieve = vi.spyOn(stripe.subscriptions, "retrieve");
    const evt = event("customer.subscription.updated", { id: org.subscriptionId, object: "subscription", customer_account: org.accountId }, { account: "acct_connected" });

    const response = await connectPOST(signed(evt, process.env.STRIPE_CONNECT_WEBHOOK_SECRET!, "/api/webhooks/stripe/connect"));

    expect(await response.json()).toMatchObject({ ignored: true });
    expect(retrieve).not.toHaveBeenCalled();
  });
});
