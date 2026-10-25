import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { makeBusiness, makeOrgAdmin, makeOrganization, makeMenuCategory, makeMenuItem } from "@/test/factories";
import { clearTestSession, sessionUserFromRow, setTestSession } from "@/test/stubs/auth-session";
import { setTestTenantHeader } from "@/test/stubs/next-headers";
import { createCategoryAction } from "@/lib/menu/category-actions";
import { toggleAvailabilityAction } from "@/lib/menu/item-actions";
import { addCardAction, openPortalAction } from "@/lib/billing/actions";
import { guestWritesBlocked, SubscriptionDegradedError } from "./degrade-guard";

// The ladder through real actions, one per scope. With no opening hours a
// branch "closes" at 04:00 local, so a clock started 8 days ago is past its
// day-7 closing whatever time the suite runs, and 16 days ago past day 15.

vi.mock("@/lib/stripe/billing", () => ({
  billingEnabled: () => true,
  createCardSetupSession: vi.fn(async () => "https://checkout.stripe.com/c/test"),
  createPortalSession: vi.fn(async () => "https://billing.stripe.com/p/test"),
}));

afterEach(() => clearTestSession());

const DAY = 24 * 60 * 60 * 1000;

async function ownerOnStep(daysLapsed: number | null) {
  const organization = await makeOrganization();
  const business = await makeBusiness({ slug: "marea", organizationId: organization.id, defaultLocale: "en" });
  await prisma.organizationSubscription.create({
    data: {
      organizationId: organization.id,
      stripeCustomerAccountId: `acct_${organization.id}`,
      stripeSubscriptionId: `sub_${organization.id}`,
      status: daysLapsed === null ? "ACTIVE" : "PAST_DUE",
      planLookupKey: "marea_basico",
      lapsedSince: daysLapsed === null ? null : new Date(Date.now() - daysLapsed * DAY),
    },
  });
  const owner = await makeOrgAdmin(organization.id);
  setTestSession(sessionUserFromRow(owner, { role: "BUSINESS_ADMIN", businessId: business.id, orgAdmin: true }));
  setTestTenantHeader(business.id);
  const category = await makeMenuCategory(business.id);
  const item = await makeMenuItem(business.id, category.id);
  return { organization, business, item };
}

const categoryForm = () => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ "en.name": "Drinks", "en.description": "", "es.name": "", "es.description": "", isActive: "on" })) data.set(key, value);
  return data;
};

/** Paying sends the owner to Stripe: a redirect, which Next throws. Anything else is the guard. */
async function reachesStripe(action: () => Promise<void>): Promise<boolean> {
  try {
    await action();
    return false;
  } catch (err) {
    if (err instanceof SubscriptionDegradedError) return false;
    return String((err as { digest?: string }).digest ?? err).includes("stripe.com");
  }
}

describe("the degrade ladder through real actions", () => {
  it("changes nothing while the clock has not reached day 7", async () => {
    await ownerOnStep(2);
    expect(await createCategoryAction(undefined, categoryForm())).toMatchObject({ success: true });
    expect((await guestWritesBlocked()).enabled).toBe(false);
  });

  it("freezes configuration on day 7 and keeps operations and paying", async () => {
    const { item } = await ownerOnStep(8);

    await expect(createCategoryAction(undefined, categoryForm())).rejects.toBeInstanceOf(SubscriptionDegradedError);
    await expect(toggleAvailabilityAction(item.id, false)).resolves.not.toThrow();
    expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: item.id } })).isAvailable).toBe(false);
    expect(await reachesStripe(addCardAction)).toBe(true);
    expect(await reachesStripe(openPortalAction)).toBe(true);
    expect((await guestWritesBlocked()).enabled).toBe(false);
  });

  it("suspends on day 15: operations and guests stop, paying still works", async () => {
    const { item } = await ownerOnStep(16);

    await expect(createCategoryAction(undefined, categoryForm())).rejects.toBeInstanceOf(SubscriptionDegradedError);
    await expect(toggleAvailabilityAction(item.id, false)).rejects.toBeInstanceOf(SubscriptionDegradedError);
    expect(await guestWritesBlocked()).toEqual({ enabled: true, reason: "suspended" });
    expect(await reachesStripe(addCardAction)).toBe(true);
    expect(await reachesStripe(openPortalAction)).toBe(true);
  });

  it("lifts every step the moment the payment clears the clock", async () => {
    const { organization } = await ownerOnStep(16);
    await prisma.organizationSubscription.update({ where: { organizationId: organization.id }, data: { status: "ACTIVE", lapsedSince: null } });

    expect(await createCategoryAction(undefined, categoryForm())).toMatchObject({ success: true });
    expect((await guestWritesBlocked()).enabled).toBe(false);
  });
});
