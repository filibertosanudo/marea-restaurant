import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { makeBusiness, makeOrgAdmin, makeOrganization } from "@/test/factories";
import { clearTestSession, sessionUserFromRow, setTestSession } from "@/test/stubs/auth-session";
import { setTestTenantHeader } from "@/test/stubs/next-headers";
import { attachCardToSubscription, createCardSetupSession, createSubscriptionCheckout, retrieveSubscription } from "@/lib/stripe/billing";
import { reactivateAction } from "./actions";

// Stripe faked at the module boundary; the plan, branch count and the
// suspended step are real rows.
vi.mock("@/lib/stripe/billing", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/stripe/billing")>();
  return {
    paymentMethodOnFile: real.paymentMethodOnFile,
    billingEnabled: () => true,
    retrieveSubscription: vi.fn(),
    attachCardToSubscription: vi.fn(async () => true),
    createCardSetupSession: vi.fn(async () => "https://checkout.stripe.com/c/setup"),
    createSubscriptionCheckout: vi.fn(async () => "https://checkout.stripe.com/c/subscribe"),
    createPortalSession: vi.fn(),
    priceForPlan: vi.fn(async (lookupKey: string) => ({ id: `price_${lookupKey}`, lookup_key: lookupKey })),
  };
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => clearTestSession());

const DAY = 24 * 60 * 60 * 1000;

async function ownerOf(status: "PAUSED" | "PAST_DUE" | "CANCELED", plan = "marea_basico", branches = 1) {
  const organization = await makeOrganization();
  const business = await makeBusiness({ slug: "marea", organizationId: organization.id });
  for (let i = 1; i < branches; i++) await makeBusiness({ organizationId: organization.id });
  await prisma.organizationSubscription.create({
    data: {
      organizationId: organization.id,
      stripeCustomerAccountId: `acct_${organization.id}`,
      stripeSubscriptionId: "sub_old",
      status,
      planLookupKey: plan,
      // Suspended: paying has to work on the last step too.
      lapsedSince: new Date(Date.now() - 16 * DAY),
    },
  });
  const owner = await makeOrgAdmin(organization.id);
  setTestSession(sessionUserFromRow(owner, { role: "BUSINESS_ADMIN", businessId: business.id, orgAdmin: true }));
  setTestTenantHeader(business.id);
}

function subscription(status: Stripe.Subscription.Status, defaultPaymentMethod: string | null = null): Stripe.Subscription {
  return { id: "sub_old", status, default_payment_method: defaultPaymentMethod, customer: { id: "cus_1", object: "customer", invoice_settings: { default_payment_method: null } } } as unknown as Stripe.Subscription;
}

async function redirectOf(): Promise<string> {
  try {
    await reactivateAction();
  } catch (err) {
    return String((err as Error).message).replace(/^REDIRECT:/, "");
  }
  throw new Error("reactivateAction did not redirect");
}

describe("reactivateAction, on a suspended organization", () => {
  it("charges the card on file of a paused subscription", async () => {
    await ownerOf("PAUSED");
    vi.mocked(retrieveSubscription).mockResolvedValue(subscription("paused", "pm_on_file"));

    expect(await redirectOf()).toBe("/admin/suscripcion?billing=reactivated");
    expect(attachCardToSubscription).toHaveBeenCalledWith(expect.objectContaining({ id: "sub_old" }), "pm_on_file");
  });

  it("says so when the card on file is declined", async () => {
    await ownerOf("PAST_DUE");
    vi.mocked(retrieveSubscription).mockResolvedValue(subscription("past_due", "pm_on_file"));
    vi.mocked(attachCardToSubscription).mockResolvedValueOnce(false);

    expect(await redirectOf()).toBe("/admin/suscripcion?billing=declined");
  });

  it("asks for a card when there is none", async () => {
    await ownerOf("PAUSED");
    vi.mocked(retrieveSubscription).mockResolvedValue(subscription("paused"));

    expect(await redirectOf()).toBe("https://checkout.stripe.com/c/setup");
    expect(createCardSetupSession).toHaveBeenCalled();
    expect(attachCardToSubscription).not.toHaveBeenCalled();
  });

  it("starts a new subscription on the plan it had, billed for every branch, when the old one ended", async () => {
    await ownerOf("CANCELED", "marea_cadena", 3);
    vi.mocked(retrieveSubscription).mockResolvedValue(subscription("canceled"));

    expect(await redirectOf()).toBe("https://checkout.stripe.com/c/subscribe");
    expect(createSubscriptionCheckout).toHaveBeenCalledWith(expect.objectContaining({ price: expect.objectContaining({ id: "price_marea_cadena" }), quantity: 3 }));
  });
});
