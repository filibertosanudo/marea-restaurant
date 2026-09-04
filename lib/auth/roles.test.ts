import { describe, it, expect } from "vitest";
import { getEffectiveRole } from "./roles";

describe("getEffectiveRole", () => {
  it("SUPER_ADMIN always wins regardless of membership", () => {
    const role = getEffectiveRole({
      role: "SUPER_ADMIN",
      memberships: [{ role: "STAFF", isActive: true }],
    });
    expect(role).toBe("SUPER_ADMIN");
  });

  it("falls back to the active membership's role", () => {
    const role = getEffectiveRole({
      role: "CUSTOMER",
      memberships: [
        { role: "STAFF", isActive: false },
        { role: "BUSINESS_ADMIN", isActive: true },
      ],
    });
    expect(role).toBe("BUSINESS_ADMIN");
  });

  it("falls back to CUSTOMER with no active membership", () => {
    const role = getEffectiveRole({ role: "CUSTOMER", memberships: [{ role: "STAFF", isActive: false }] });
    expect(role).toBe("CUSTOMER");
  });
});
