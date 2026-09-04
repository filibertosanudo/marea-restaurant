import { describe, it, expect } from "vitest";
import { requireRole, ForbiddenError } from "@/lib/auth/permissions";
import { ADMIN_ROLES, STAFF_ROLES } from "@/lib/auth/roles";
import { UserRole } from "@/lib/generated/prisma/client";
import { setTestSession } from "@/test/stubs/auth-session";

const ALL_ROLES: UserRole[] = ["CUSTOMER", "STAFF", "BUSINESS_ADMIN", "SUPER_ADMIN"];

function sessionUser(role: UserRole, overrides: { revoked?: boolean; mustChangePassword?: boolean } = {}) {
  return {
    id: "test-user",
    email: "staff@test.marea",
    name: "Test Staff",
    role,
    businessId: null,
    mustChangePassword: overrides.mustChangePassword ?? false,
    revoked: overrides.revoked ?? false,
  };
}

// Mirrors docs/product/roles-y-alcance.md's permission matrix — one row per
// distinct role-set an actual requireRole(...) call site uses in this
// codebase. A new action built on the wrong role-set shows up here the
// moment its row is added; that's the whole point of keeping this as data
// instead of one assertion buried in each feature's own test file.
const ACTIONS: { action: string; roles: UserRole[] }[] = [
  { action: "advance order status", roles: STAFF_ROLES },
  { action: "collect cash payment", roles: STAFF_ROLES },
  { action: "cancel order", roles: ADMIN_ROLES },
  { action: "create refund", roles: ADMIN_ROLES },
  { action: "toggle dish sold out", roles: STAFF_ROLES },
  { action: "edit menu item", roles: ADMIN_ROLES },
  { action: "edit menu category", roles: ADMIN_ROLES },
  { action: "edit modifier group", roles: ADMIN_ROLES },
  { action: "manage tables and qr codes", roles: ADMIN_ROLES },
  { action: "manage team", roles: ADMIN_ROLES },
  { action: "business settings", roles: ADMIN_ROLES },
  { action: "upload menu photo", roles: ADMIN_ROLES },
  { action: "confirm or seat a reservation", roles: STAFF_ROLES },
  { action: "delete a reservation", roles: ADMIN_ROLES },
];

const CASES = ACTIONS.flatMap(({ action, roles }) =>
  ALL_ROLES.map((role) => ({ action, roles, role, allowed: roles.includes(role) }))
);

describe("permission matrix", () => {
  it.each(CASES)("$action / $role -> allowed=$allowed", async ({ roles, role, allowed }) => {
    setTestSession(sessionUser(role));

    if (allowed) {
      await expect(requireRole(...roles)).resolves.toBeDefined();
    } else {
      await expect(requireRole(...roles)).rejects.toThrow(ForbiddenError);
    }
  });

  // The two cases requireRole checks that the matrix above can't express —
  // both must lose to a role that would otherwise pass every row above.
  it("rejects a revoked session regardless of role", async () => {
    setTestSession(sessionUser("SUPER_ADMIN", { revoked: true }));
    await expect(requireRole(...ADMIN_ROLES)).rejects.toThrow(ForbiddenError);
  });

  it("rejects a session that must change its password regardless of role", async () => {
    setTestSession(sessionUser("SUPER_ADMIN", { mustChangePassword: true }));
    await expect(requireRole(...ADMIN_ROLES)).rejects.toThrow(ForbiddenError);
  });

  it("rejects when there's no session at all", async () => {
    await expect(requireRole(...STAFF_ROLES)).rejects.toThrow(ForbiddenError);
  });
});
