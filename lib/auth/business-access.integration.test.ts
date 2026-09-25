import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { authorizeBusiness, firstBusinessFor, listAccessibleBusinesses } from "@/lib/auth/business-access";
import { claimsForSignIn, claimsForSwitch, revalidateClaims, tokenAfterUpdate } from "@/lib/auth/token-claims";
import { makeBusiness, makeMembership, makeOrgAdmin, makeOrganization, makeStaff } from "@/test/factories";

// Two chains and a standalone business: the shape in which one organization's
// administrator must never be able to act on another's.
async function world() {
  const orgA = await makeOrganization({ name: "Chain A" });
  const orgB = await makeOrganization({ name: "Chain B" });
  const a1 = await makeBusiness({ slug: "a1", name: "A One", organizationId: orgA.id });
  const a2 = await makeBusiness({ slug: "a2", name: "A Two", organizationId: orgA.id });
  const b1 = await makeBusiness({ slug: "b1", name: "B One", organizationId: orgB.id });
  const solo = await makeBusiness({ slug: "solo", name: "Solo" });
  return { orgA, orgB, a1, a2, b1, solo };
}

describe("authorizeBusiness", () => {
  it("gives a member the role of their membership at that business only", async () => {
    const { a1, a2 } = await world();
    const waiter = await makeStaff("CUSTOMER");
    await makeMembership(waiter.id, a1.id, { role: "STAFF" });

    expect(await authorizeBusiness(waiter.id, a1.id)).toBe("STAFF");
    expect(await authorizeBusiness(waiter.id, a2.id)).toBeNull();
  });

  it("refuses a deactivated membership and a deleted account", async () => {
    const { a1 } = await world();
    const gone = await makeStaff("CUSTOMER");
    await makeMembership(gone.id, a1.id, { isActive: false });
    const deleted = await makeStaff("CUSTOMER", { deletedAt: new Date() });
    await makeMembership(deleted.id, a1.id);

    expect(await authorizeBusiness(gone.id, a1.id)).toBeNull();
    expect(await authorizeBusiness(deleted.id, a1.id)).toBeNull();
  });

  it("makes an ORG_ADMIN a BUSINESS_ADMIN at every business of their organization, and nothing elsewhere", async () => {
    const { orgA, a1, a2, b1, solo } = await world();
    const owner = await makeOrgAdmin(orgA.id);

    expect(await authorizeBusiness(owner.id, a1.id)).toBe("BUSINESS_ADMIN");
    expect(await authorizeBusiness(owner.id, a2.id)).toBe("BUSINESS_ADMIN");
    // The crossing this exists to stop.
    expect(await authorizeBusiness(owner.id, b1.id)).toBeNull();
    expect(await authorizeBusiness(owner.id, solo.id)).toBeNull();
    expect(await authorizeBusiness(owner.id, "no-such-business")).toBeNull();
  });

  it("lets the platform operator act on any business that exists", async () => {
    const { a1, b1 } = await world();
    const operator = await makeStaff("SUPER_ADMIN");

    expect(await authorizeBusiness(operator.id, a1.id)).toBe("SUPER_ADMIN");
    expect(await authorizeBusiness(operator.id, b1.id)).toBe("SUPER_ADMIN");
    expect(await authorizeBusiness(operator.id, "no-such-business")).toBeNull();
  });

  it("stops recognising an ORG_ADMIN at a business the moment it leaves their organization", async () => {
    const { orgA, a1 } = await world();
    const owner = await makeOrgAdmin(orgA.id);
    expect(await authorizeBusiness(owner.id, a1.id)).toBe("BUSINESS_ADMIN");

    await prisma.business.update({ where: { id: a1.id }, data: { organizationId: null } });

    expect(await authorizeBusiness(owner.id, a1.id)).toBeNull();
  });
});

describe("the token", () => {
  it("is refused when it names a business of another organization, however it got there", async () => {
    const { orgA, b1 } = await world();
    const owner = await makeOrgAdmin(orgA.id);

    // A tampered or stale token: a valid ORG_ADMIN carrying a business that is not theirs.
    expect(await revalidateClaims({ sub: owner.id, businessId: b1.id })).toBeNull();
  });

  it("keeps an ORG_ADMIN signed in on their own businesses, as BUSINESS_ADMIN with the org flag", async () => {
    const { orgA, a2 } = await world();
    const owner = await makeOrgAdmin(orgA.id);

    expect(await revalidateClaims({ sub: owner.id, businessId: a2.id })).toEqual({
      role: "BUSINESS_ADMIN",
      businessId: a2.id,
      orgAdmin: true,
      mustChangePassword: false,
    });
  });

  it("ends a session when the membership is deactivated, the account is deleted or the password changed", async () => {
    const { a1 } = await world();
    const waiter = await makeStaff("CUSTOMER");
    const membership = await makeMembership(waiter.id, a1.id);
    expect(await revalidateClaims({ sub: waiter.id, businessId: a1.id })).not.toBeNull();

    await prisma.user.update({ where: { id: waiter.id }, data: { passwordChangedAt: new Date() } });
    expect(await revalidateClaims({ sub: waiter.id, businessId: a1.id, iat: 1 })).toBeNull();
    await prisma.user.update({ where: { id: waiter.id }, data: { passwordChangedAt: null } });

    await prisma.businessMembership.update({ where: { id: membership.id }, data: { isActive: false } });
    expect(await revalidateClaims({ sub: waiter.id, businessId: a1.id })).toBeNull();

    await prisma.businessMembership.update({ where: { id: membership.id }, data: { isActive: true } });
    await prisma.user.update({ where: { id: waiter.id }, data: { deletedAt: new Date() } });
    expect(await revalidateClaims({ sub: waiter.id, businessId: a1.id })).toBeNull();
  });

  it("lets only the platform operator hold a token with no business", async () => {
    await world();
    const operator = await makeStaff("SUPER_ADMIN");
    const waiter = await makeStaff("CUSTOMER");

    expect((await revalidateClaims({ sub: operator.id, businessId: null }))?.role).toBe("SUPER_ADMIN");
    expect(await revalidateClaims({ sub: waiter.id, businessId: null })).toBeNull();
  });
});

describe("switching business", () => {
  it("lets a user with two memberships move between them, and not to a third", async () => {
    const { a1, a2, b1 } = await world();
    const floater = await makeStaff("CUSTOMER");
    await makeMembership(floater.id, a1.id, { role: "STAFF" });
    await makeMembership(floater.id, b1.id, { role: "BUSINESS_ADMIN" });

    expect((await claimsForSwitch(floater.id, b1.id))?.role).toBe("BUSINESS_ADMIN");
    expect((await claimsForSwitch(floater.id, a1.id))?.role).toBe("STAFF");
    // Not theirs: nothing about asking for it makes it so.
    expect(await claimsForSwitch(floater.id, a2.id)).toBeNull();
  });

  it("lets an ORG_ADMIN move across their organization and never outside it", async () => {
    const { orgA, a1, a2, b1, solo } = await world();
    const owner = await makeOrgAdmin(orgA.id);

    expect((await claimsForSwitch(owner.id, a2.id))?.businessId).toBe(a2.id);
    expect((await claimsForSwitch(owner.id, a1.id))?.businessId).toBe(a1.id);
    expect(await claimsForSwitch(owner.id, b1.id)).toBeNull();
    expect(await claimsForSwitch(owner.id, solo.id)).toBeNull();
  });

  it("offers exactly the businesses that could be switched to", async () => {
    const { orgA, a1, a2 } = await world();
    const owner = await makeOrgAdmin(orgA.id);

    const offered = await listAccessibleBusinesses(owner.id);
    expect(offered.map((b) => b.id).sort()).toEqual([a1.id, a2.id].sort());
    expect(offered.map((b) => b.name)).toEqual(["A One", "A Two"]);
  });

  it("starts a session on the oldest business of the chain, or of the memberships", async () => {
    const { orgA, a1, b1 } = await world();
    const owner = await makeOrgAdmin(orgA.id);
    const waiter = await makeStaff("CUSTOMER");
    await makeMembership(waiter.id, b1.id);

    expect(await firstBusinessFor(owner.id)).toBe(a1.id);
    expect(await firstBusinessFor(waiter.id)).toBe(b1.id);
    expect((await claimsForSignIn(owner.id, await firstBusinessFor(owner.id)))?.orgAdmin).toBe(true);
  });
});

describe("the database", () => {
  it("requires an organization for an ORG_ADMIN and allows one for nobody else", async () => {
    const { orgA } = await world();

    await expect(makeStaff("ORG_ADMIN")).rejects.toThrow(/user_org_admin_has_organization/);
    await expect(makeStaff("STAFF", { organizationId: orgA.id })).rejects.toThrow(/user_org_admin_has_organization/);
    await expect(makeOrgAdmin(orgA.id)).resolves.toBeTruthy();
  });
});

describe("a session update", () => {
  const base = (sub: string, businessId: string | null) => ({
    sub,
    role: "BUSINESS_ADMIN" as const,
    businessId,
    orgAdmin: true,
    mustChangePassword: false,
    checkedAt: 0,
  });

  it("switches to a business the user may act on", async () => {
    const { orgA, a1, a2 } = await world();
    const owner = await makeOrgAdmin(orgA.id);

    const after = await tokenAfterUpdate(base(owner.id, a1.id), { switchBusinessId: a2.id });

    expect(after.businessId).toBe(a2.id);
    expect(after.checkedAt).toBeGreaterThan(0);
  });

  it("leaves the token alone when the business is another organization's", async () => {
    const { orgA, a1, b1 } = await world();
    const owner = await makeOrgAdmin(orgA.id);
    const token = base(owner.id, a1.id);

    expect(await tokenAfterUpdate(token, { switchBusinessId: b1.id })).toEqual(token);
  });

  it("ignores a payload that sets claims directly instead of asking to switch", async () => {
    const { orgA, a1, b1 } = await world();
    const owner = await makeOrgAdmin(orgA.id);
    const token = base(owner.id, a1.id);

    const forged = { businessId: b1.id, role: "SUPER_ADMIN", orgAdmin: true, user: { businessId: b1.id } };
    expect(await tokenAfterUpdate(token, forged)).toEqual(token);
    expect(await tokenAfterUpdate(token, { switchBusinessId: 42 })).toEqual(token);
    expect(await tokenAfterUpdate(token, null)).toEqual(token);
  });
});
