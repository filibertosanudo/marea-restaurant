import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { makeBusiness } from "@/test/factories";
import { requestPasswordResetAction, resetPasswordAction } from "./reset-actions";

function emailForm(email: string) {
  const data = new FormData();
  data.set("email", email);
  return data;
}

function resetForm(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function latestResetToken(userId: string) {
  return prisma.passwordResetToken.findFirstOrThrow({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

describe("requestPasswordResetAction", () => {
  it("returns the same submitted state for an unknown email", async () => {
    const result = await requestPasswordResetAction(undefined, emailForm("nobody@marea.test"));
    expect(result).toEqual({ submitted: true });
  });

  it("returns the same submitted state and queues a job for a known staff email", async () => {
    await makeBusiness({ slug: "marea" });
    const user = await prisma.user.create({
      data: { email: "admin@marea.test", passwordHash: await hashPassword("old-password-123") },
    });

    const result = await requestPasswordResetAction(undefined, emailForm("admin@marea.test"));

    expect(result).toEqual({ submitted: true });
    const token = await latestResetToken(user.id);
    expect(token.usedAt).toBeNull();
    expect(token.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const job = await prisma.notificationJob.findFirst({ where: { recipientUserId: user.id } });
    expect(job?.templateKey).toBe("password.reset");
  });

  it("rejects a malformed email without touching the database", async () => {
    const result = await requestPasswordResetAction(undefined, emailForm("not-an-email"));
    expect(result).toEqual({ submitted: false, error: "invalidEmail" });
  });

  it("stops issuing new tokens once the per-email quota is spent", async () => {
    await makeBusiness({ slug: "marea" });
    const user = await prisma.user.create({
      data: { email: "quota@marea.test", passwordHash: await hashPassword("old-password-123") },
    });

    for (let i = 0; i < 5; i++) {
      await requestPasswordResetAction(undefined, emailForm("quota@marea.test"));
    }
    const beforeExtra = await prisma.passwordResetToken.count({ where: { userId: user.id } });

    const result = await requestPasswordResetAction(undefined, emailForm("quota@marea.test"));
    const afterExtra = await prisma.passwordResetToken.count({ where: { userId: user.id } });

    // Same generic response either way — rate limiting must not be
    // distinguishable from a normal "check your email" response.
    expect(result).toEqual({ submitted: true });
    expect(afterExtra).toBe(beforeExtra);
  });
});

describe("resetPasswordAction", () => {
  it("rejects an unknown token without revealing why", async () => {
    const result = await resetPasswordAction(
      undefined,
      resetForm({ token: "not-a-real-token", newPassword: "greenTurtleUmbrella99", confirmPassword: "greenTurtleUmbrella99" })
    );
    expect(result).toEqual({ error: "invalidOrExpiredToken" });
  });

  it("rejects an expired token", async () => {
    const user = await prisma.user.create({
      data: { email: "expired@marea.test", passwordHash: await hashPassword("old-password-123") },
    });
    const { hashResetToken } = await import("./reset-token");
    const rawToken = "expired-token-value";
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashResetToken(rawToken),
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const result = await resetPasswordAction(
      undefined,
      resetForm({ token: rawToken, newPassword: "greenTurtleUmbrella99", confirmPassword: "greenTurtleUmbrella99" })
    );
    expect(result).toEqual({ error: "invalidOrExpiredToken" });
  });

  it("rejects a weak new password", async () => {
    const user = await prisma.user.create({
      data: { email: "weak@marea.test", passwordHash: await hashPassword("old-password-123") },
    });
    const { hashResetToken } = await import("./reset-token");
    const rawToken = "weak-token-value";
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashResetToken(rawToken), expiresAt: new Date(Date.now() + 60_000) },
    });

    const result = await resetPasswordAction(
      undefined,
      resetForm({ token: rawToken, newPassword: "password12345", confirmPassword: "password12345" })
    );
    expect(result).toEqual({ error: "passwordTooWeak" });
  });

  it("resets the password, invalidates the token, and closes other sessions", async () => {
    const user = await prisma.user.create({
      data: {
        email: "reset@marea.test",
        passwordHash: await hashPassword("old-password-123"),
        mustChangePassword: true,
      },
    });
    const { hashResetToken } = await import("./reset-token");
    const usedToken = "used-token-value";
    const staleToken = "stale-token-value";
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashResetToken(usedToken), expiresAt: new Date(Date.now() + 60_000) },
    });
    const staleRow = await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashResetToken(staleToken), expiresAt: new Date(Date.now() + 60_000) },
    });

    const result = await resetPasswordAction(
      undefined,
      resetForm({ token: usedToken, newPassword: "greenTurtleUmbrella99", confirmPassword: "greenTurtleUmbrella99" })
    );

    expect(result).toEqual({ success: true });

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword(updatedUser.passwordHash!, "greenTurtleUmbrella99")).toBe(true);
    expect(updatedUser.mustChangePassword).toBe(false);
    expect(updatedUser.passwordChangedAt).not.toBeNull();

    // The stale, unrelated token for the same user is invalidated too.
    const staleAfter = await prisma.passwordResetToken.findUniqueOrThrow({ where: { id: staleRow.id } });
    expect(staleAfter.usedAt).not.toBeNull();

    // A second attempt to redeem the same token fails — one token, one use.
    const secondAttempt = await resetPasswordAction(
      undefined,
      resetForm({ token: usedToken, newPassword: "anotherStrongPassphrase42", confirmPassword: "anotherStrongPassphrase42" })
    );
    expect(secondAttempt).toEqual({ error: "invalidOrExpiredToken" });
  });
});
