import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { makeBusiness, makeOrgAdmin, makeOrganization, makeStaff, makeMembership } from "@/test/factories";
import { setTestSession, sessionUserFromRow, clearTestSession } from "@/test/stubs/auth-session";
import { setTestTenantHeader } from "@/test/stubs/next-headers";
import { setSubscriptionQuantity } from "@/lib/stripe/billing";
import { addBranchAction } from "./branch-actions";

vi.mock("@/lib/stripe/billing", () => ({ billingEnabled: () => true, setSubscriptionQuantity: vi.fn() }));

beforeEach(() => vi.mocked(setSubscriptionQuantity).mockReset());
afterEach(() => clearTestSession());

function branchForm(name: string, slug: string) {
  const data = new FormData();
  data.set("name", name);
  data.set("slug", slug);
  return data;
}

async function ownerOfOrganization(plan: string | null, subscriptionId: string | null = null) {
  const organization = await makeOrganization();
  const business = await makeBusiness({ slug: `main-${Math.random().toString(36).slice(2, 8)}`, organizationId: organization.id, timezone: "America/Mexico_City" });
  if (plan) {
    await prisma.organizationSubscription.create({
      data: { organizationId: organization.id, stripeCustomerAccountId: `acct_${organization.id}`, stripeSubscriptionId: subscriptionId, status: "TRIALING", planLookupKey: plan },
    });
  }
  const owner = await makeOrgAdmin(organization.id);
  setTestSession(sessionUserFromRow(owner, { role: "BUSINESS_ADMIN", businessId: business.id, orgAdmin: true }));
  setTestTenantHeader(business.id);
  return { organization, business };
}

const branchesOf = (organizationId: string) => prisma.business.count({ where: { organizationId } });

describe("addBranchAction", () => {
  it("refuses a second branch on a one-branch plan and names the plan", async () => {
    const { organization } = await ownerOfOrganization("marea_basico");

    expect(await addBranchAction(undefined, branchForm("Sur", "sur-basico"))).toEqual({ ok: false, error: "branch_limit", plan: "basico" });
    expect(await branchesOf(organization.id)).toBe(1);
  });

  it("adds a branch on the chain plan, copying the caller's settings, and bills for it", async () => {
    const { organization } = await ownerOfOrganization("marea_cadena", "sub_chain");

    expect(await addBranchAction(undefined, branchForm("Sur", "sur-cadena"))).toEqual({ ok: true, slug: "sur-cadena" });

    const branch = await prisma.business.findUniqueOrThrow({ where: { slug: "sur-cadena" } });
    expect(branch).toMatchObject({ organizationId: organization.id, timezone: "America/Mexico_City", acceptsOnlinePayment: false, onboardingStep: 1 });
    expect(setSubscriptionQuantity).toHaveBeenCalledWith("sub_chain", 2);
  });

  it("keeps the branch when Stripe fails to take the new quantity", async () => {
    const { organization } = await ownerOfOrganization("marea_cadena", "sub_chain_down");
    vi.mocked(setSubscriptionQuantity).mockRejectedValueOnce(new Error("Stripe is down"));

    expect(await addBranchAction(undefined, branchForm("Sur", "sur-down"))).toEqual({ ok: true, slug: "sur-down" });
    expect(await branchesOf(organization.id)).toBe(2);
  });

  it("does not limit an organization the platform does not bill", async () => {
    const { organization } = await ownerOfOrganization(null);

    expect(await addBranchAction(undefined, branchForm("Sur", "sur-free"))).toEqual({ ok: true, slug: "sur-free" });
    expect(await branchesOf(organization.id)).toBe(2);
    expect(setSubscriptionQuantity).not.toHaveBeenCalled();
  });

  it("says when the address is taken or not valid", async () => {
    await makeBusiness({ slug: "taken-slug" });
    await ownerOfOrganization(null);

    expect(await addBranchAction(undefined, branchForm("Sur", "taken-slug"))).toEqual({ ok: false, error: "slug_taken" });
    expect(await addBranchAction(undefined, branchForm("Sur", "admin"))).toMatchObject({ ok: false, error: "invalid_input" });
  });

  it("refuses a branch administrator who is not the organization's owner", async () => {
    const organization = await makeOrganization();
    const business = await makeBusiness({ slug: "only-admin", organizationId: organization.id });
    const admin = await makeStaff("BUSINESS_ADMIN");
    await makeMembership(admin.id, business.id);
    setTestSession(sessionUserFromRow(admin, { businessId: business.id }));
    setTestTenantHeader(business.id);

    await expect(addBranchAction(undefined, branchForm("Sur", "sur-admin"))).rejects.toThrow("owner");
    expect(await branchesOf(organization.id)).toBe(1);
  });
});
