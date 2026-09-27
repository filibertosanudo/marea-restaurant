import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { hashVerificationToken } from "@/lib/auth/signup-token";
import { makeBusiness, makeOrganization } from "@/test/factories";
import { runInTenant } from "@/lib/tenancy/context";
import { runWithCookies } from "@/test/stubs/next-headers";
import { signupAction, verifyEmailAction, type SignupState } from "./signup-actions";

const PAST_RENDER = String(Date.now() - 10_000);

// signupAction reads the admin-lang cookie for a successful signup's own
// notification locale — there's no live request to back cookies() outside
// one, same reasoning as every other action test that touches it.
function signup(form: FormData): Promise<SignupState> {
  return runWithCookies({}, () => signupAction(undefined, form));
}

function signupForm(fields: Partial<Record<"businessName" | "slug" | "name" | "email" | "password" | "confirmPassword" | "company" | "renderedAt", string>> = {}) {
  const data = new FormData();
  const defaults = {
    businessName: "Cala",
    slug: `cala-${Math.random().toString(36).slice(2, 8)}`,
    name: "Ana",
    email: `ana-${Math.random().toString(36).slice(2, 8)}@example.test`,
    password: "greenTurtleUmbrella99",
    confirmPassword: "greenTurtleUmbrella99",
    company: "",
    renderedAt: PAST_RENDER,
  };
  for (const [key, value] of Object.entries({ ...defaults, ...fields })) data.set(key, value);
  return data;
}

function tokenForm(token: string) {
  const data = new FormData();
  data.set("token", token);
  return data;
}

describe("signupAction", () => {
  it("creates an organization, a business and its admin, and queues a verification email", async () => {
    const slug = `nuevo-${Math.random().toString(36).slice(2, 8)}`;
    const email = `dueno-${Math.random().toString(36).slice(2, 8)}@example.test`;
    const result = await signup(signupForm({ slug, businessName: "Nuevo", name: "Dueño", email }));

    expect(result).toEqual({ submitted: true });

    const business = await prisma.business.findUniqueOrThrow({ where: { slug } });
    expect(business.acceptsOnlinePayment).toBe(false);
    const organization = await prisma.organization.findUniqueOrThrow({ where: { id: business.organizationId! } });
    expect(organization.verifiedAt).toBeNull();

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.mustChangePassword).toBe(false);
    expect(await verifyPassword(user.passwordHash!, "greenTurtleUmbrella99")).toBe(true);

    const membership = await runInTenant(business.id, () =>
      prisma.businessMembership.findFirstOrThrow({ where: { userId: user.id, businessId: business.id } })
    );
    expect(membership.role).toBe("BUSINESS_ADMIN");

    const token = await prisma.emailVerificationToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(token.organizationId).toBe(organization.id);
    expect(token.usedAt).toBeNull();

    const job = await runInTenant(business.id, () => prisma.notificationJob.findFirstOrThrow({ where: { recipientUserId: user.id } }));
    expect(job.templateKey).toBe("signup.verify");
  });

  it("rejects a reserved slug, an invalid one and a duplicate as field errors, not a generic failure", async () => {
    const takenSlug = `taken-${Math.random().toString(36).slice(2, 8)}`;
    await signup(signupForm({ slug: takenSlug }));

    const reserved = await signup(signupForm({ slug: "admin" }));
    expect(reserved).toMatchObject({ submitted: false, fieldErrors: { slug: expect.stringMatching(/reserved/i) } });

    const invalid = await signup(signupForm({ slug: "Not Valid" }));
    expect(invalid?.submitted).toBe(false);

    const duplicate = await signup(signupForm({ slug: takenSlug }));
    expect(duplicate).toMatchObject({ submitted: false, fieldErrors: { slug: expect.stringMatching(/already exists/i) } });
  });

  it("rejects mismatched or weak passwords as field errors", async () => {
    const mismatched = await signup(signupForm({ confirmPassword: "somethingElse99" }));
    expect(mismatched?.submitted).toBe(false);

    const weak = await signup(signupForm({ password: "password12345", confirmPassword: "password12345" }));
    expect(weak?.submitted).toBe(false);
  });

  it("pretends to succeed, and creates nothing, when the honeypot is filled", async () => {
    const slug = `bot-${Math.random().toString(36).slice(2, 8)}`;
    const result = await signup(signupForm({ slug, company: "a real company" }));

    expect(result).toEqual({ submitted: true });
    expect(await prisma.business.findUnique({ where: { slug } })).toBeNull();
  });

  it("pretends to succeed, and creates nothing, when submitted implausibly fast", async () => {
    const slug = `fast-${Math.random().toString(36).slice(2, 8)}`;
    const result = await signup(signupForm({ slug, renderedAt: String(Date.now()) }));

    expect(result).toEqual({ submitted: true });
    expect(await prisma.business.findUnique({ where: { slug } })).toBeNull();
  });

  it("returns the same response for an email that already has an account, and creates no second business", async () => {
    const organization = await makeOrganization();
    const business = await makeBusiness({ organizationId: organization.id });
    const email = `existing-${Math.random().toString(36).slice(2, 8)}@example.test`;
    const existingUser = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword("whatever-they-had-99"),
        memberships: { create: { businessId: business.id, role: "BUSINESS_ADMIN", isActive: true } },
      },
    });

    const slug = `otro-${Math.random().toString(36).slice(2, 8)}`;
    const result = await signup(signupForm({ slug, email }));

    // Identical shape to a real signup's response — see requestPasswordResetAction for the same rule.
    expect(result).toEqual({ submitted: true });
    expect(await prisma.business.findUnique({ where: { slug } })).toBeNull();
    expect(await prisma.user.count({ where: { email } })).toBe(1);

    const notice = await runInTenant(business.id, () =>
      prisma.notificationJob.findFirst({ where: { recipientUserId: existingUser.id, templateKey: "signup.email-taken" } })
    );
    expect(notice).not.toBeNull();
  });

  it("stops issuing new signups once the per-IP quota is spent", async () => {
    for (let i = 0; i < 5; i++) {
      await signup(signupForm());
    }
    const result = await signup(signupForm());
    expect(result).toEqual({ submitted: false, error: "rate_limited" });
  });
});

describe("verifyEmailAction", () => {
  it("rejects an unknown token", async () => {
    const result = await verifyEmailAction(undefined, tokenForm("not-a-real-token"));
    expect(result).toEqual({ error: "invalidOrExpiredToken" });
  });

  it("rejects an expired token", async () => {
    const organization = await makeOrganization({ verifiedAt: null });
    const user = await prisma.user.create({ data: { email: `expired-${Math.random()}@example.test`, passwordHash: "x" } });
    const rawToken = "expired-signup-token";
    await prisma.emailVerificationToken.create({
      data: { userId: user.id, organizationId: organization.id, tokenHash: hashVerificationToken(rawToken), expiresAt: new Date(Date.now() - 1000) },
    });

    const result = await verifyEmailAction(undefined, tokenForm(rawToken));
    expect(result).toEqual({ error: "invalidOrExpiredToken" });
  });

  it("verifies the organization and the user, and the token cannot be reused", async () => {
    const organization = await makeOrganization({ verifiedAt: null });
    const business = await makeBusiness({ organizationId: organization.id });
    const user = await prisma.user.create({
      data: {
        email: `verify-${Math.random()}@example.test`,
        passwordHash: "x",
        memberships: { create: { businessId: business.id, role: "BUSINESS_ADMIN", isActive: true } },
      },
    });
    const rawToken = "good-signup-token";
    await prisma.emailVerificationToken.create({
      data: { userId: user.id, organizationId: organization.id, tokenHash: hashVerificationToken(rawToken), expiresAt: new Date(Date.now() + 60_000) },
    });

    const result = await verifyEmailAction(undefined, tokenForm(rawToken));
    expect(result).toEqual({ success: true });

    const verifiedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(verifiedUser.emailVerified).not.toBeNull();
    const verifiedOrg = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } });
    expect(verifiedOrg.verifiedAt).not.toBeNull();

    const second = await verifyEmailAction(undefined, tokenForm(rawToken));
    expect(second).toEqual({ error: "invalidOrExpiredToken" });
  });
});
