import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { authorizeBusiness } from "@/lib/auth/business-access";
import { verifyPassword } from "@/lib/auth/password";
import {
  ProvisionError,
  assignBusinessToOrganization,
  createBusiness,
  createBusinessAdmin,
  createOrgAdmin,
  createOrganization,
  listTenants,
} from "./provision";

describe("onboarding a business without touching the database", () => {
  it("creates an organization, a business in it, and the two people who run them", async () => {
    const organization = await createOrganization(prisma, { slug: "marea-group", name: "Marea Group" });
    const business = await createBusiness(prisma, {
      slug: "cala",
      name: "Cala",
      organizationSlug: "marea-group",
      currency: "MXN",
      timezone: "America/Mexico_City",
    });
    const admin = await createBusinessAdmin(prisma, { businessSlug: "cala", email: "ana@cala.test", name: "Ana" });
    const owner = await createOrgAdmin(prisma, { organizationSlug: "marea-group", email: "dueno@marea.test", name: "Dueño" });

    expect(business).toMatchObject({ slug: "cala", currency: "MXN", organizationId: organization.id, acceptsOnlinePayment: false });
    expect(await prisma.businessTranslation.count({ where: { businessId: business.id } })).toBe(2);

    // The temporary password is real, forces a change, and opens exactly what it should.
    expect(admin.user.mustChangePassword).toBe(true);
    expect(await verifyPassword(admin.user.passwordHash!, admin.temporaryPassword)).toBe(true);
    expect(await authorizeBusiness(admin.user.id, business.id)).toBe("BUSINESS_ADMIN");
    expect(owner.user).toMatchObject({ role: "ORG_ADMIN", organizationId: organization.id });
    expect(await authorizeBusiness(owner.user.id, business.id)).toBe("BUSINESS_ADMIN");
  });

  it("gives each new administrator a different password", async () => {
    await createBusiness(prisma, { slug: "uno", name: "Uno" });
    const a = await createBusinessAdmin(prisma, { businessSlug: "uno", email: "a@uno.test", name: "A" });
    const b = await createBusinessAdmin(prisma, { businessSlug: "uno", email: "b@uno.test", name: "B" });
    expect(a.temporaryPassword).not.toBe(b.temporaryPassword);
    expect(a.temporaryPassword.length).toBeGreaterThanOrEqual(12);
  });

  it("refuses a slug that cannot be a subdomain, a duplicate, and an unknown organization", async () => {
    await createBusiness(prisma, { slug: "cala", name: "Cala" });

    await expect(createBusiness(prisma, { slug: "Cala Norte", name: "x" })).rejects.toThrow(ProvisionError);
    await expect(createBusiness(prisma, { slug: "admin", name: "x" })).rejects.toThrow(/reserved/);
    await expect(createBusiness(prisma, { slug: "cala", name: "again" })).rejects.toThrow(/already exists/);
    await expect(createBusiness(prisma, { slug: "otra", name: "x", organizationSlug: "nope" })).rejects.toThrow(/No organization/);
    // Nothing half-created by the failures.
    expect(await prisma.business.count()).toBe(1);
  });

  it("refuses an email that already has an account, and an administrator for a business that does not exist", async () => {
    await createBusiness(prisma, { slug: "cala", name: "Cala" });
    await createBusinessAdmin(prisma, { businessSlug: "cala", email: "ana@cala.test", name: "Ana" });

    await expect(createBusinessAdmin(prisma, { businessSlug: "cala", email: "ana@cala.test", name: "Ana" })).rejects.toThrow(/already has an account/);
    await expect(createBusinessAdmin(prisma, { businessSlug: "nope", email: "x@y.test", name: "X" })).rejects.toThrow(/No business/);
    await expect(createBusinessAdmin(prisma, { businessSlug: "cala", email: "not-an-email", name: "X" })).rejects.toThrow(/not an email/);
  });

  it("moves a standalone business into a chain, and lists everything", async () => {
    await createOrganization(prisma, { slug: "grupo", name: "Grupo" });
    await createBusiness(prisma, { slug: "solo", name: "Solo" });
    await createBusiness(prisma, { slug: "otro", name: "Otro", organizationSlug: "grupo" });

    expect((await listTenants(prisma)).standalone.map((b) => b.slug)).toEqual(["solo"]);

    await assignBusinessToOrganization(prisma, { businessSlug: "solo", organizationSlug: "grupo" });

    const listing = await listTenants(prisma);
    expect(listing.standalone).toEqual([]);
    expect(listing.organizations[0].businesses.map((b) => b.slug).sort()).toEqual(["otro", "solo"]);
  });
});
