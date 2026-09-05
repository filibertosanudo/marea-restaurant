import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTeamMemberAction, setTeamMemberActiveAction } from "./actions";
import { makeBusiness, makeStaff } from "@/test/factories";
import { setTestSession, sessionUserFromRow } from "@/test/stubs/auth-session";

async function loginAsAdmin() {
  const user = await makeStaff("BUSINESS_ADMIN");
  setTestSession(sessionUserFromRow(user));
  return user;
}

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("createTeamMemberAction", () => {
  it("creates a new staff member with a temporary password", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();

    const result = await createTeamMemberAction(
      undefined,
      formData({ name: "Diego Fuentes", email: "diego@marea.test", role: "STAFF" })
    );

    expect(result).toMatchObject({ success: true });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "diego@marea.test" } });
    expect(user.mustChangePassword).toBe(true);
    const membership = await prisma.businessMembership.findFirstOrThrow({ where: { userId: user.id } });
    expect(membership.businessId).toBe(business.id);
    expect(membership.role).toBe("STAFF");
  });

  it("rejects an email already in use", async () => {
    await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    await prisma.user.create({ data: { email: "diego@marea.test", name: "Existing" } });

    const result = await createTeamMemberAction(
      undefined,
      formData({ name: "Diego Fuentes", email: "diego@marea.test", role: "STAFF" })
    );

    expect(result).toMatchObject({ error: "email_taken" });
  });

  it("rejects a non-admin caller", async () => {
    await makeBusiness({ slug: "marea" });
    const user = await makeStaff("STAFF");
    setTestSession(sessionUserFromRow(user));

    await expect(
      createTeamMemberAction(undefined, formData({ name: "X", email: "x@marea.test", role: "STAFF" }))
    ).rejects.toThrow();
  });
});

describe("setTeamMemberActiveAction", () => {
  it("deactivates a different member", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const other = await makeStaff("STAFF");
    const membership = await prisma.businessMembership.create({
      data: { businessId: business.id, userId: other.id, role: "STAFF", isActive: true },
    });

    await setTeamMemberActiveAction(membership.id, false);

    const updated = await prisma.businessMembership.findUniqueOrThrow({ where: { id: membership.id } });
    expect(updated.isActive).toBe(false);
  });

  it("refuses to deactivate the caller's own membership", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const admin = await loginAsAdmin();
    const membership = await prisma.businessMembership.create({
      data: { businessId: business.id, userId: admin.id, role: "BUSINESS_ADMIN", isActive: true },
    });

    await setTeamMemberActiveAction(membership.id, false);

    const unchanged = await prisma.businessMembership.findUniqueOrThrow({ where: { id: membership.id } });
    expect(unchanged.isActive).toBe(true);
  });
});
