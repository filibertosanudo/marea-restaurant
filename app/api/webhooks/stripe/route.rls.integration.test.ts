import { afterAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { stripe } from "@/lib/stripe/client";
import { testSchema } from "@/test/db";
import { POST } from "./route";

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
