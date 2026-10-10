import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { makeBusiness, makeOrganization } from "@/test/factories";
import { purgeUnverifiedSignups, UNVERIFIED_SIGNUP_RETENTION_MS } from "./purge-unverified-signups";

const now = new Date("2027-01-01T00:00:00Z");
const old = new Date(now.getTime() - UNVERIFIED_SIGNUP_RETENTION_MS - 60 * 60 * 1000);
const recent = new Date(now.getTime() - 60 * 60 * 1000);

// "owner" is what signupAction creates now: an ORG_ADMIN whose only tie to
// the business is the organization. "member" is the earlier shape, a
// BUSINESS_ADMIN membership, which an unverified signup may still be in.
async function seedOne(createdAt: Date, verified: boolean, shape: "owner" | "member" = "owner") {
  const organization = await makeOrganization({ createdAt, verifiedAt: verified ? createdAt : null });
  const business = await makeBusiness({ organizationId: organization.id });
  const user = await prisma.user.create({
    data: {
      email: `${organization.id}@example.test`,
      passwordHash: "x",
      ...(shape === "owner"
        ? { role: "ORG_ADMIN" as const, organizationId: organization.id }
        : { memberships: { create: { businessId: business.id, role: "BUSINESS_ADMIN" as const, isActive: true } } }),
    },
  });
  await prisma.emailVerificationToken.create({
    data: { userId: user.id, organizationId: organization.id, tokenHash: `hash-${organization.id}`, expiresAt: new Date(createdAt.getTime() + 60_000) },
  });
  return { organization, business, user };
}

describe("purgeUnverifiedSignups", () => {
  it("counts without deleting when dryRun is true", async () => {
    const stale = await seedOne(old, false);
    await seedOne(recent, false);
    await seedOne(old, true);

    const result = await purgeUnverifiedSignups(now, true);

    expect(result.candidates).toBe(1);
    expect(result.purged).toBe(0);
    expect(await prisma.organization.findUnique({ where: { id: stale.organization.id } })).not.toBeNull();
  });

  it("deletes only unverified organizations past the cutoff, and leaves verified or recent ones alone", async () => {
    const stale = await seedOne(old, false);
    const recentSignup = await seedOne(recent, false);
    const verifiedOld = await seedOne(old, true);

    const result = await purgeUnverifiedSignups(now, false);

    expect(result).toMatchObject({ candidates: 1, purged: 1 });
    expect(await prisma.organization.findUnique({ where: { id: stale.organization.id } })).toBeNull();
    expect(await prisma.business.findUnique({ where: { id: stale.business.id } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: stale.user.id } })).toBeNull();

    expect(await prisma.organization.findUnique({ where: { id: recentSignup.organization.id } })).not.toBeNull();
    expect(await prisma.organization.findUnique({ where: { id: verifiedOld.organization.id } })).not.toBeNull();
  });

  it("purges an unverified signup whose owner is an ORG_ADMIN with no membership, users before the organization", async () => {
    const stale = await seedOne(old, false, "owner");
    expect(await prisma.businessMembership.count({ where: { userId: stale.user.id } })).toBe(0);

    const result = await purgeUnverifiedSignups(now, false);

    expect(result).toMatchObject({ candidates: 1, purged: 1 });
    expect(await prisma.user.findUnique({ where: { id: stale.user.id } })).toBeNull();
    expect(await prisma.business.findUnique({ where: { id: stale.business.id } })).toBeNull();
    expect(await prisma.organization.findUnique({ where: { id: stale.organization.id } })).toBeNull();
  });

  it("still purges the membership shape, and keeps an ORG_ADMIN of another organization", async () => {
    const stale = await seedOne(old, false, "member");
    const verifiedOwner = await seedOne(old, true, "owner");

    const result = await purgeUnverifiedSignups(now, false);

    expect(result).toMatchObject({ candidates: 1, purged: 1 });
    expect(await prisma.organization.findUnique({ where: { id: stale.organization.id } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: verifiedOwner.user.id } })).not.toBeNull();
  });
});
