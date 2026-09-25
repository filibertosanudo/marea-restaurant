import { describe, it, expect } from "vitest";
import { roleAtBusiness } from "./roles";

const standalone = { organizationId: null };
const chain = { organizationId: "org-a" };

describe("roleAtBusiness", () => {
  it("SUPER_ADMIN acts on any business, whatever their memberships", () => {
    const user = { role: "SUPER_ADMIN" as const, organizationId: null, memberships: [{ role: "STAFF" as const, isActive: true }] };
    expect(roleAtBusiness(user, standalone)).toBe("SUPER_ADMIN");
    expect(roleAtBusiness(user, chain)).toBe("SUPER_ADMIN");
  });

  it("takes the role of the active membership at that business", () => {
    const user = {
      role: "CUSTOMER" as const,
      organizationId: null,
      memberships: [
        { role: "STAFF" as const, isActive: false },
        { role: "BUSINESS_ADMIN" as const, isActive: true },
      ],
    };
    expect(roleAtBusiness(user, standalone)).toBe("BUSINESS_ADMIN");
  });

  it("is null with no active membership", () => {
    expect(
      roleAtBusiness({ role: "CUSTOMER", organizationId: null, memberships: [{ role: "STAFF", isActive: false }] }, standalone)
    ).toBeNull();
  });

  it("makes an ORG_ADMIN a BUSINESS_ADMIN at every business of their own organization", () => {
    const admin = { role: "ORG_ADMIN" as const, organizationId: "org-a", memberships: [] };
    expect(roleAtBusiness(admin, { organizationId: "org-a" })).toBe("BUSINESS_ADMIN");
  });

  it("gives an ORG_ADMIN nothing at another organization's business, or at a standalone one", () => {
    const admin = { role: "ORG_ADMIN" as const, organizationId: "org-a", memberships: [] };
    expect(roleAtBusiness(admin, { organizationId: "org-b" })).toBeNull();
    expect(roleAtBusiness(admin, standalone)).toBeNull();
  });

  it("does not let an ORG_ADMIN with no organization match a standalone business", () => {
    const broken = { role: "ORG_ADMIN" as const, organizationId: null, memberships: [] };
    expect(roleAtBusiness(broken, standalone)).toBeNull();
  });
});
