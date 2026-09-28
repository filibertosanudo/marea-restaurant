"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getAdminLang } from "@/lib/i18n/cookie";
import { hashPassword } from "@/lib/auth/password";
import { getClientIp, isScopeRateLimited, recordScopeAttempt } from "@/lib/auth/rate-limit";
import { signupSchema } from "@/lib/auth/schemas";
import { generateVerificationToken, hashVerificationToken, SIGNUP_VERIFICATION_TOKEN_TTL_MS } from "@/lib/auth/signup-token";
import { firstBusinessFor } from "@/lib/auth/business-access";
import { ProvisionError, signUp } from "@/lib/tenants/provision";
import { verifyOrganization } from "@/lib/tenants/verification";
import { runInTenant } from "@/lib/tenancy/context";
import { appOrigin } from "@/lib/env";
import { expireBusinessCache } from "@/lib/business";
import { assertWritable } from "@/lib/ops/read-only";

const SIGNUP_MAX_ATTEMPTS = 5;
const SIGNUP_WINDOW_MS = 60 * 60 * 1000;
// A bot that submits faster than this never saw the page — a human's
// fastest realistic fill-and-submit is well above this. Paired with the
// honeypot, not a replacement for it: this alone would also catch a browser
// extension that resubmits a stale form.
const MIN_SUBMIT_MS = 2000;

export type SignupState =
  | { submitted: true }
  | { submitted: false; error?: string; fieldErrors?: Record<string, string> }
  | undefined;

function fieldErrorsFrom(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

// Dummy work for whichever branch (new signup / email already exists) isn't
// taken, so a difference in wall-clock time isn't a second oracle next to
// the one the identical response already closes — same trick, and same
// acknowledged limit ("roughly the same cost", not a proof), as
// lib/auth/reset-actions.ts's requestPasswordResetAction.
async function comparableDummyWork(): Promise<void> {
  await prisma.$transaction([prisma.organization.count(), prisma.user.count()]);
}

export async function signupAction(_prevState: SignupState, formData: FormData): Promise<SignupState> {
  // First line, no exception: a signup writes real rows, same as any other
  // mutation, and has no session for requireRole to check this through.
  await assertWritable();
  const ipAddress = getClientIp(await headers());

  // Every submission counts toward the quota, matching a real one's cost —
  // no "only failed attempts count" branch for a bot to exploit.
  const limited = await isScopeRateLimited("signup:create:ip", ipAddress, SIGNUP_MAX_ATTEMPTS, SIGNUP_WINDOW_MS);
  await recordScopeAttempt("signup:create:ip", ipAddress);
  if (limited) {
    return { submitted: false, error: "rate_limited" };
  }

  const renderedAt = Number(formData.get("renderedAt"));
  const submittedState: SignupState = { submitted: true };

  // Honeypot filled, or submitted implausibly fast: say it worked (a bot
  // acting on a rejection just tries again with a cleverer payload) and do
  // nothing else.
  const honeypot = String(formData.get("company") ?? "");
  const tooFast = !Number.isFinite(renderedAt) || Date.now() - renderedAt < MIN_SUBMIT_MS;
  if (honeypot.trim() !== "" || tooFast) {
    return submittedState;
  }

  const parsed = signupSchema.safeParse({
    businessName: formData.get("businessName"),
    slug: formData.get("slug"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    company: honeypot,
  });
  if (!parsed.success) {
    return { submitted: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }
  const { businessName, slug, name, email, password } = parsed.data;

  const emailLimited = await isScopeRateLimited("signup:create:email", email, SIGNUP_MAX_ATTEMPTS, SIGNUP_WINDOW_MS);
  await recordScopeAttempt("signup:create:email", email);
  if (emailLimited) {
    return { submitted: false, error: "rate_limited" };
  }

  // Never reveal whether this email already has an account, in the message
  // or in how long it took to answer — see comparableDummyWork above.
  const existing = await prisma.user.findUnique({ where: { email, deletedAt: null } });
  if (existing) {
    await comparableDummyWork();
    const existingBusinessId = await firstBusinessFor(existing.id);
    if (existingBusinessId) {
      await runInTenant(existingBusinessId, () =>
        prisma.notificationJob.create({
          data: {
            businessId: existingBusinessId,
            channel: "EMAIL",
            templateKey: "signup.email-taken",
            recipientUserId: existing.id,
            recipientEmail: email,
            locale: existing.locale,
            payload: {
              loginUrl: `${appOrigin()}/admin/login`,
              forgotPasswordUrl: `${appOrigin()}/admin/forgot-password`,
            },
          },
        })
      );
    }
    // No businesses left to act on (every membership deactivated, say): the
    // account is real but there's nowhere to send the notice from. Silence
    // here still creates nothing and still answers identically — an
    // acceptable gap, not an enumeration channel.
    return submittedState;
  }

  let signedUp: Awaited<ReturnType<typeof signUp>>;
  try {
    signedUp = await signUp(prisma, { slug, name: businessName });
  } catch (err) {
    if (err instanceof ProvisionError) {
      // Slugs aren't secret — every service that lets you pick a subdomain
      // says so immediately. This is not the channel Q2 was about.
      return { submitted: false, fieldErrors: { slug: err.message } };
    }
    throw err;
  }
  const { organizationId, businessId } = signedUp;
  const locale = await getAdminLang();

  // Not one transaction with signUp() above: businessId doesn't exist until
  // that call returns, so runInTenant(businessId, ...) can't start any
  // earlier. If the app crashes between the two, the org/business are left
  // unverified with no admin who can sign in — indistinguishable from a
  // signup nobody finished, so lib/ops/purge-unverified-signups.ts sweeps it
  // away on its own schedule. No special-cased recovery needed.
  await runInTenant(businessId, () =>
    prisma.$transaction(async (tx) => {
      const passwordHash = await hashPassword(password);
      const user = await tx.user.create({
        data: {
          email,
          name,
          role: "CUSTOMER",
          passwordHash,
          mustChangePassword: false,
          locale,
          memberships: { create: { businessId, role: "BUSINESS_ADMIN", isActive: true } },
        },
      });

      const { token, tokenHash } = generateVerificationToken();
      await tx.emailVerificationToken.create({
        data: { userId: user.id, organizationId, tokenHash, expiresAt: new Date(Date.now() + SIGNUP_VERIFICATION_TOKEN_TTL_MS) },
      });

      await tx.notificationJob.create({
        data: {
          businessId,
          channel: "EMAIL",
          templateKey: "signup.verify",
          recipientUserId: user.id,
          recipientEmail: email,
          locale,
          payload: {
            verifyUrl: `${appOrigin()}/admin/verify-email/${token}`,
            businessName,
            expiresInHours: SIGNUP_VERIFICATION_TOKEN_TTL_MS / (60 * 60 * 1000),
          },
          dedupeKey: `signup-verify:${user.id}`,
        },
      });
    })
  );

  return submittedState;
}

export type VerifyEmailState = { error: string } | { success: true } | undefined;

export async function verifyEmailAction(_prevState: VerifyEmailState, formData: FormData): Promise<VerifyEmailState> {
  await assertWritable();
  const token = String(formData.get("token") ?? "");
  if (!token) return { error: "invalidOrExpiredToken" };

  const tokenHash = hashVerificationToken(token);
  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });

  // Invalid, expired and already-used all collapse into the same error —
  // same reasoning as resetPasswordAction: telling them apart tells whoever
  // is guessing which guess landed closest.
  const isUsable = record && !record.usedAt && record.expiresAt > new Date();
  if (!isUsable) {
    return { error: "invalidOrExpiredToken" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: record.userId }, data: { emailVerified: new Date() } });
    await tx.emailVerificationToken.updateMany({ where: { userId: record.userId, usedAt: null }, data: { usedAt: new Date() } });
    // The one write marea_app cannot make with an ordinary UPDATE — see the
    // migration's own comment on marea_verify_organization. Inside the same
    // transaction as the two updates above: the token is only ever marked
    // used together with the organization actually becoming verified.
    await verifyOrganization(tx, record.organizationId);
  });

  // Best-effort: the public cache would catch up within PUBLIC_CACHE_TTL_SECONDS
  // on its own, but there's no reason to make someone who just confirmed
  // their email wait up to a minute to see their own page exist.
  const businessId = await firstBusinessFor(record.userId);
  if (businessId) {
    const business = await runInTenant(businessId, () => prisma.business.findUnique({ where: { id: businessId }, select: { id: true, slug: true } }));
    if (business) expireBusinessCache(business);
  }

  return { success: true };
}
