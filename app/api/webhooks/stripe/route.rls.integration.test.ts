import { afterAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { stripe } from "@/lib/stripe/client";
import { testSchema } from "@/test/db";
import { POST } from "./route";
import { POST as connectPOST } from "./connect/route";

// The webhook runs in the web process with no host and no session: all it has
// is the PaymentIntent a signed event names. Under row level security the
// application role sees nothing until a business is set, so this proves the
// route finds the business first (lib/tenancy/discover.ts, as marea_worker)
// and then writes inside it as marea_app. The route's own `prisma` is the
// restricted one here; the rows are arranged, and checked, as the owner.

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

function signedRequest(event: object) {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! });
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body: payload,
  });
}

async function pendingCardPayment(slug: string, intentId: string) {
  const business = await owner.business.create({ data: { slug, name: slug } });
  const order = await owner.order.create({ data: { businessId: business.id, orderNumber: `T-${slug}` } });
  return owner.payment.create({
    data: {
      businessId: business.id,
      orderId: order.id,
      provider: "STRIPE",
      status: "PENDING",
      amount: "23.19",
      stripePaymentIntentId: intentId,
    },
  });
}

const succeeded = (intentId: string) => ({
  id: `evt_${intentId}`,
  object: "event",
  type: "payment_intent.succeeded",
  data: { object: { id: intentId, object: "payment_intent" } },
});

describe("POST /api/webhooks/stripe under row level security", () => {
  it("settles the payment of the business the PaymentIntent belongs to, and only that one", async () => {
    const marea = await pendingCardPayment("marea", "pi_marea");
    const cala = await pendingCardPayment("cala", "pi_cala");

    const response = await POST(signedRequest(succeeded("pi_cala")));

    expect(response.status).toBe(200);
    expect((await owner.payment.findUniqueOrThrow({ where: { id: cala.id } })).status).toBe("SUCCEEDED");
    expect((await owner.payment.findUniqueOrThrow({ where: { id: marea.id } })).status).toBe("PENDING");
  });

  it("records an event for a payment it does not know and changes nothing", async () => {
    const marea = await pendingCardPayment("marea", "pi_marea");

    const response = await POST(signedRequest(succeeded("pi_someone_elses")));

    expect(response.status).toBe(200);
    expect((await owner.payment.findUniqueOrThrow({ where: { id: marea.id } })).status).toBe("PENDING");
    expect(await owner.stripeWebhookEvent.count({ where: { eventId: "evt_pi_someone_elses" } })).toBe(1);
  });
});

describe("POST /api/webhooks/stripe/connect under row level security", () => {
  function connectRequest(event: object) {
    const payload = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_connect_secret" });
    return new Request("http://localhost/api/webhooks/stripe/connect", { method: "POST", headers: { "stripe-signature": signature }, body: payload });
  }
  const connectEvent = (id: string, type: string, account: string, object: object) => ({ id, object: "event", type, livemode: false, account, data: { object } });

  it("settles a payment made on the business's account, and only that business's", async () => {
    const marea = await pendingCardPayment("marea", "pi_marea_c");
    const cala = await owner.business.create({ data: { slug: "cala", name: "cala" } });
    const order = await owner.order.create({ data: { businessId: cala.id, orderNumber: "T-cala" } });
    const calaPayment = await owner.payment.create({
      data: { businessId: cala.id, orderId: order.id, provider: "STRIPE", status: "PENDING", amount: "23.19", stripePaymentIntentId: "pi_cala_c", stripeAccountId: "acct_cala" },
    });

    const response = await connectPOST(connectRequest(connectEvent("evt_c1", "payment_intent.succeeded", "acct_cala", { id: "pi_cala_c", object: "payment_intent" })));

    expect(response.status).toBe(200);
    expect((await owner.payment.findUniqueOrThrow({ where: { id: calaPayment.id } })).status).toBe("SUCCEEDED");
    expect((await owner.payment.findUniqueOrThrow({ where: { id: marea.id } })).status).toBe("PENDING");
  });

  it("disconnects the business whose account was deauthorized, and no other", async () => {
    const marea = await owner.business.create({ data: { slug: "marea", name: "marea", stripeAccountId: "acct_marea", stripeCardPaymentsStatus: "ACTIVE", acceptsOnlinePayment: true } });
    const cala = await owner.business.create({ data: { slug: "cala", name: "cala", stripeAccountId: "acct_cala", stripeCardPaymentsStatus: "ACTIVE", acceptsOnlinePayment: true } });

    const response = await connectPOST(connectRequest(connectEvent("evt_c2", "account.application.deauthorized", "acct_cala", { id: "acct_cala", object: "application" })));

    expect(response.status).toBe(200);
    expect(await owner.business.findUniqueOrThrow({ where: { id: cala.id } })).toMatchObject({ stripeAccountId: null, stripeCardPaymentsStatus: "RESTRICTED", acceptsOnlinePayment: false });
    expect(await owner.business.findUniqueOrThrow({ where: { id: marea.id } })).toMatchObject({ stripeAccountId: "acct_marea", stripeCardPaymentsStatus: "ACTIVE", acceptsOnlinePayment: true });
  });

  it("records the state of an account that was updated", async () => {
    const business = await owner.business.create({ data: { slug: "marea", name: "marea", stripeAccountId: "acct_marea", stripeCardPaymentsStatus: "ACTIVE" } });
    vi.spyOn(stripe.v2.core.accounts, "retrieve").mockResolvedValue({
      id: "acct_marea",
      livemode: false,
      closed: false,
      configuration: { merchant: { capabilities: { card_payments: { status: "restricted" } } } },
    } as never);

    const response = await connectPOST(connectRequest(connectEvent("evt_c3", "account.updated", "acct_marea", { id: "acct_marea", object: "account" })));

    expect(response.status).toBe(200);
    expect((await owner.business.findUniqueOrThrow({ where: { id: business.id } })).stripeCardPaymentsStatus).toBe("RESTRICTED");
  });
});
