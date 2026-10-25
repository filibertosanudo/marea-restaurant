import { afterAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import type Stripe from "stripe";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { testSchema } from "@/test/db";
import type { BillingStripe } from "@/lib/stripe/billing";
import { ensureSubscription } from "./start";

// ensureSubscription runs in the web process, as marea_app, inside the
// organization's first business: this proves the row level security policy
// lets it insert and update its own organization's row and no other. The
// rows are arranged, and checked, as the owner.

function urlAs(role: string): string {
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("options", `-c search_path=${testSchema} -c role=${role}`);
  return url.toString();
}

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

async function organizationWithBusinesses(count: number) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const organization = await owner.organization.create({ data: { name: `Org ${suffix}`, slug: `org-${suffix}`, verifiedAt: new Date() } });
  const businesses = [];
  for (let i = 0; i < count; i++) {
    businesses.push(await owner.business.create({ data: { name: `Branch ${i}`, slug: `b-${suffix}-${i}`, organizationId: organization.id } }));
  }
  return { organization, businesses };
}

function fakeStripe(options: { failSubscription?: boolean } = {}) {
  const calls = { accounts: [] as unknown[], subscriptions: [] as Array<{ params: Stripe.SubscriptionCreateParams; key?: string }> };
  const client = {
    v2: {
      core: {
        accounts: {
          create: vi.fn(async (params: unknown) => {
            calls.accounts.push(params);
            return { id: "acct_customer_1" };
          }),
        },
      },
    },
    prices: { list: vi.fn(async () => ({ data: [{ id: "price_basico", lookup_key: "marea_basico" }] })) },
    subscriptions: {
      create: vi.fn(async (params: Stripe.SubscriptionCreateParams, opts?: { idempotencyKey?: string }) => {
        if (options.failSubscription) throw new Error("Stripe is down");
        calls.subscriptions.push({ params, key: opts?.idempotencyKey });
        return {
          id: "sub_1",
          status: "trialing",
          trial_end: 1_794_127_307,
          cancel_at_period_end: false,
          default_payment_method: null,
          customer: "cus_1",
          items: { data: [{ quantity: params.items?.[0]?.quantity ?? 1, current_period_end: 1_794_127_307, price: { lookup_key: "marea_basico" } }] },
        };
      }),
    },
  } as unknown as BillingStripe;
  return { client, calls };
}

describe("ensureSubscription, as marea_app", () => {
  it("creates the payer and a 14-day trial that pauses without a card, and stores Stripe's answer", async () => {
    const { organization, businesses } = await organizationWithBusinesses(1);
    const { client, calls } = fakeStripe();

    const row = await ensureSubscription({ organizationId: organization.id, businessId: businesses[0].id, email: "owner@example.test" }, client);

    expect(row).toMatchObject({ stripeCustomerAccountId: "acct_customer_1", stripeSubscriptionId: "sub_1", status: "TRIALING", planLookupKey: "marea_basico", quantity: 1 });
    expect(calls.accounts[0]).toMatchObject({ configuration: { customer: {} }, contact_email: "owner@example.test", metadata: { marea_organization: organization.id } });
    expect(calls.subscriptions[0].params).toMatchObject({
      customer_account: "acct_customer_1",
      trial_period_days: 14,
      trial_settings: { end_behavior: { missing_payment_method: "pause" } },
    });
    expect(calls.subscriptions[0].key).toBe(`marea-billing-subscription-${organization.id}`);
    expect(await owner.organizationSubscription.count({ where: { organizationId: organization.id } })).toBe(1);
  });

  it("does nothing the second time", async () => {
    const { organization, businesses } = await organizationWithBusinesses(1);
    const { client } = fakeStripe();
    await ensureSubscription({ organizationId: organization.id, businessId: businesses[0].id, email: null }, client);
    const again = fakeStripe();

    await ensureSubscription({ organizationId: organization.id, businessId: businesses[0].id, email: null }, again.client);

    expect(again.calls.accounts).toHaveLength(0);
    expect(again.calls.subscriptions).toHaveLength(0);
  });

  it("keeps the payer when the subscription fails, and finishes from there without a second payer", async () => {
    const { organization, businesses } = await organizationWithBusinesses(1);
    const input = { organizationId: organization.id, businessId: businesses[0].id, email: null };

    await expect(ensureSubscription(input, fakeStripe({ failSubscription: true }).client)).rejects.toThrow("Stripe is down");
    expect(await owner.organizationSubscription.findUniqueOrThrow({ where: { organizationId: organization.id } })).toMatchObject({
      stripeCustomerAccountId: "acct_customer_1",
      stripeSubscriptionId: null,
      status: "NOT_STARTED",
    });

    const retry = fakeStripe();
    const row = await ensureSubscription(input, retry.client);
    expect(retry.calls.accounts).toHaveLength(0);
    expect(row.status).toBe("TRIALING");
  });

  it("cannot write the subscription of an organization its business is not in", async () => {
    const mine = await organizationWithBusinesses(1);
    const theirs = await organizationWithBusinesses(1);

    // The other organization's id, from inside my business: the policy hides
    // their organization, so the start never gets as far as Stripe.
    const { client, calls } = fakeStripe();
    await expect(ensureSubscription({ organizationId: theirs.organization.id, businessId: mine.businesses[0].id, email: null }, client)).rejects.toThrow();
    expect(calls.accounts).toHaveLength(0);
    expect(await owner.organizationSubscription.count({ where: { organizationId: theirs.organization.id } })).toBe(0);
  });
});
