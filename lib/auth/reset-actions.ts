"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { getClientIp, isScopeRateLimited, recordScopeAttempt } from "@/lib/auth/rate-limit";
import { requestPasswordResetSchema, resetPasswordSchema } from "@/lib/auth/schemas";
import { generateResetToken, hashResetToken, RESET_TOKEN_TTL_MS } from "@/lib/auth/reset-token";
import { getCurrentBusiness } from "@/lib/business";
import { appOrigin } from "@/lib/env";

const RESET_REQUEST_MAX_ATTEMPTS = 5;
const RESET_REQUEST_WINDOW_MS = 60 * 60 * 1000;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type RequestPasswordResetState = { submitted: boolean; error?: string } | undefined;

export async function requestPasswordResetAction(
  _prevState: RequestPasswordResetState,
  formData: FormData
): Promise<RequestPasswordResetState> {
  const parsed = requestPasswordResetSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { submitted: false, error: "invalidEmail" };
  }

  const email = normalizeEmail(parsed.data.email);
  const ipAddress = getClientIp(await headers());

  // Deliberately the same response whether the email exists, is rate
  // limited, or isn't staff at all — collapsing these cases is the point,
  // not an oversight: telling them apart is exactly the account-enumeration
  // oracle this flow exists to avoid.
  const submittedState: RequestPasswordResetState = { submitted: true };

  const [limitedByIp, limitedByEmail] = await Promise.all([
    isScopeRateLimited("password:reset:ip", ipAddress, RESET_REQUEST_MAX_ATTEMPTS, RESET_REQUEST_WINDOW_MS),
    isScopeRateLimited("password:reset:email", email, RESET_REQUEST_MAX_ATTEMPTS, RESET_REQUEST_WINDOW_MS),
  ]);

  // Every call counts toward the quota — from the caller's side every call
  // returns the same submittedState, so there's no "failed attempt" to
  // distinguish from a real one that a success-only quota could key off.
  await Promise.all([
    recordScopeAttempt("password:reset:ip", ipAddress),
    recordScopeAttempt("password:reset:email", email),
  ]);

  if (limitedByIp || limitedByEmail) {
    return submittedState;
  }

  const user = await prisma.user.findUnique({ where: { email, deletedAt: null } });
  if (!user || !user.passwordHash) {
    // Costs roughly the same as the real branch below (a transaction with
    // two statements) without writing anything, so response timing doesn't
    // become the oracle the identical response body was meant to close.
    await prisma.$transaction([
      prisma.passwordResetToken.count({ where: { userId: email } }),
      prisma.notificationJob.count({ where: { businessId: email } }),
    ]);
    return submittedState;
  }

  const { token, tokenHash } = generateResetToken();
  const business = await getCurrentBusiness();
  const resetUrl = `${appOrigin()}/admin/reset-password/${token}`;

  // Outbox pattern, same as reservation/order confirmations: the job is
  // queued in the same transaction as the token it links to, so a failed
  // transaction never leaves an email promising a link that doesn't exist.
  await prisma.$transaction(async (tx) => {
    const resetToken = await tx.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
    });

    await tx.notificationJob.create({
      data: {
        businessId: business.id,
        channel: "EMAIL",
        templateKey: "password.reset",
        recipientUserId: user.id,
        recipientEmail: user.email ?? email,
        locale: business.defaultLocale,
        payload: { resetUrl },
        dedupeKey: `password-reset:${resetToken.id}`,
      },
    });
  });

  // Module 11 (the notification worker) doesn't exist yet — this is the
  // only way to actually click the link before then.
  if (process.env.NODE_ENV !== "production") {
    console.log(`[password reset] ${email} -> ${resetUrl}`);
  }

  return submittedState;
}

export type ResetPasswordState = { error: string } | { success: true } | undefined;

export async function resetPasswordAction(
  _prevState: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    const newPasswordIssue = parsed.error.issues.find((issue) => issue.path[0] === "newPassword");
    if (newPasswordIssue) {
      return { error: newPasswordIssue.code === "too_small" ? "passwordTooShort" : "passwordTooWeak" };
    }
    if (parsed.error.issues.some((issue) => issue.path[0] === "confirmPassword")) {
      return { error: "passwordsDontMatch" };
    }
    return { error: "invalidOrExpiredToken" };
  }

  const tokenHash = hashResetToken(parsed.data.token);
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  // Invalid, expired, and already-used all collapse into the same error on
  // purpose — telling them apart tells an attacker which guess landed closest.
  const isUsable = resetToken && !resetToken.usedAt && resetToken.expiresAt > new Date();
  if (!isUsable) {
    return { error: "invalidOrExpiredToken" };
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  const now = new Date();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash, mustChangePassword: false, passwordChangedAt: now },
    }),
    // Invalidates this token AND every other still-open one for the same
    // user — a stale link from an earlier request must not still work once
    // a newer one already changed the password.
    prisma.passwordResetToken.updateMany({
      where: { userId: resetToken.userId, usedAt: null },
      data: { usedAt: now },
    }),
  ]);

  return { success: true };
}
