import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTeamMemberAction, setTeamMemberActiveAction, setTeamMemberRoleAction } from "./actions";
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

    const result = await setTeamMemberActiveAction(membership.id, false);

    expect(result).toEqual({ ok: true });
    const updated = await prisma.businessMembership.findUniqueOrThrow({ where: { id: membership.id } });
    expect(updated.isActive).toBe(false);
  });

  it("refuses to deactivate the caller's own membership", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const admin = await loginAsAdmin();
    const membership = await prisma.businessMembership.create({
      data: { businessId: business.id, userId: admin.id, role: "BUSINESS_ADMIN", isActive: true },
    });

    const result = await setTeamMemberActiveAction(membership.id, false);

    expect(result).toEqual({ ok: false, error: "self" });
    const unchanged = await prisma.businessMembership.findUniqueOrThrow({ where: { id: membership.id } });
    expect(unchanged.isActive).toBe(true);
  });

  it("refuses to deactivate the business's last active admin", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const lastAdmin = await makeStaff("BUSINESS_ADMIN");
    const membership = await prisma.businessMembership.create({
      data: { businessId: business.id, userId: lastAdmin.id, role: "BUSINESS_ADMIN", isActive: true },
    });

    const result = await setTeamMemberActiveAction(membership.id, false);

    expect(result).toEqual({ ok: false, error: "last_admin" });
    const unchanged = await prisma.businessMembership.findUniqueOrThrow({ where: { id: membership.id } });
    expect(unchanged.isActive).toBe(true);
  });

  it("allows deactivating an admin when another active admin remains", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const admin1 = await makeStaff("BUSINESS_ADMIN");
    const admin2 = await makeStaff("BUSINESS_ADMIN");
    const membership1 = await prisma.businessMembership.create({
      data: { businessId: business.id, userId: admin1.id, role: "BUSINESS_ADMIN", isActive: true },
    });
    await prisma.businessMembership.create({
      data: { businessId: business.id, userId: admin2.id, role: "BUSINESS_ADMIN", isActive: true },
    });

    const result = await setTeamMemberActiveAction(membership1.id, false);

    expect(result).toEqual({ ok: true });
  });

  it("logs a MembershipEvent with the caller as author", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const admin = await loginAsAdmin();
    const other = await makeStaff("STAFF");
    const membership = await prisma.businessMembership.create({
      data: { businessId: business.id, userId: other.id, role: "STAFF", isActive: true },
    });

    await setTeamMemberActiveAction(membership.id, false);

    const event = await prisma.membershipEvent.findFirstOrThrow({ where: { membershipId: membership.id } });
    expect(event.changedById).toBe(admin.id);
    expect(event.fromActive).toBe(true);
    expect(event.toActive).toBe(false);
  });
});

describe("setTeamMemberRoleAction", () => {
  it("changes a different member's role and logs it", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const admin = await loginAsAdmin();
    const other = await makeStaff("STAFF");
    const membership = await prisma.businessMembership.create({
      data: { businessId: business.id, userId: other.id, role: "STAFF", isActive: true },
    });

    const result = await setTeamMemberRoleAction(membership.id, "BUSINESS_ADMIN");

    expect(result).toEqual({ ok: true });
    const updated = await prisma.businessMembership.findUniqueOrThrow({ where: { id: membership.id } });
    expect(updated.role).toBe("BUSINESS_ADMIN");
    const event = await prisma.membershipEvent.findFirstOrThrow({ where: { membershipId: membership.id } });
    expect(event.changedById).toBe(admin.id);
    expect(event.fromRole).toBe("STAFF");
    expect(event.toRole).toBe("BUSINESS_ADMIN");
  });

  it("refuses to change the caller's own role", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const admin = await loginAsAdmin();
    const membership = await prisma.businessMembership.create({
      data: { businessId: business.id, userId: admin.id, role: "BUSINESS_ADMIN", isActive: true },
    });

    const result = await setTeamMemberRoleAction(membership.id, "STAFF");

    expect(result).toEqual({ ok: false, error: "self" });
    const unchanged = await prisma.businessMembership.findUniqueOrThrow({ where: { id: membership.id } });
    expect(unchanged.role).toBe("BUSINESS_ADMIN");
  });

  it("refuses to demote the business's last active admin", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const lastAdmin = await makeStaff("BUSINESS_ADMIN");
    const membership = await prisma.businessMembership.create({
      data: { businessId: business.id, userId: lastAdmin.id, role: "BUSINESS_ADMIN", isActive: true },
    });

    const result = await setTeamMemberRoleAction(membership.id, "STAFF");

    expect(result).toEqual({ ok: false, error: "last_admin" });
    const unchanged = await prisma.businessMembership.findUniqueOrThrow({ where: { id: membership.id } });
    expect(unchanged.role).toBe("BUSINESS_ADMIN");
  });

  it("allows demoting an admin when another active admin remains", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const admin1 = await makeStaff("BUSINESS_ADMIN");
    const admin2 = await makeStaff("BUSINESS_ADMIN");
    const membership1 = await prisma.businessMembership.create({
      data: { businessId: business.id, userId: admin1.id, role: "BUSINESS_ADMIN", isActive: true },
    });
    await prisma.businessMembership.create({
      data: { businessId: business.id, userId: admin2.id, role: "BUSINESS_ADMIN", isActive: true },
    });

    const result = await setTeamMemberRoleAction(membership1.id, "STAFF");

    expect(result).toEqual({ ok: true });
  });
});
