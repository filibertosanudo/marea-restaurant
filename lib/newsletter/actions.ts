"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/business";
import { appOrigin } from "@/lib/env";
import type { Lang } from "@/lib/i18n/lang";
import { getClientIp, isScopeRateLimited, recordScopeAttempt } from "@/lib/auth/rate-limit";
import { subscribeSchema } from "@/lib/newsletter/schemas";

// A public, unauthenticated form — same class of endpoint as reservation
// and order creation, and rate-limited the same way. Ten is generous for
// a real visitor (nobody resubmits the newsletter form ten times) and
// tight enough that it isn't a free way to spam confirmation emails at
// an address that isn't the attacker's own.
const SUBSCRIBE_SCOPE = "newsletter:subscribe";
const SUBSCRIBE_MAX_ATTEMPTS = 10;
const SUBSCRIBE_WINDOW_MS = 60 * 60 * 1000;

export type SubscribeResult = { ok: true } | { ok: false; error: "invalid_input" | "rate_limited" };

/**
 * Always the same success response whether the address is brand new,
 * already pending confirmation, or previously unsubscribed — the point
 * isn't hiding account existence (this isn't a login), it's that a
 * newsletter signup form has no business telling a visitor anything more
 * specific than "check your email."
 */
export async function subscribeAction(email: string, lang: Lang): Promise<SubscribeResult> {
  const parsed = subscribeSchema.safeParse({ email });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const ip = getClientIp(await headers());
  if (await isScopeRateLimited(SUBSCRIBE_SCOPE, ip, SUBSCRIBE_MAX_ATTEMPTS, SUBSCRIBE_WINDOW_MS)) {
    return { ok: false, error: "rate_limited" };
  }
  await recordScopeAttempt(SUBSCRIBE_SCOPE, ip);

  const business = await getCurrentBusiness();

  await prisma.$transaction(async (tx) => {
    const existing = await tx.newsletterSubscriber.findUnique({
      where: { businessId_email: { businessId: business.id, email: parsed.data.email } },
    });

    // Already confirmed and still subscribed: nothing to do, and no email
    // to send — resending a confirmation to someone already receiving the
    // newsletter would just be noise.
    if (existing?.confirmedAt && !existing.unsubscribedAt) return;

    // Every other case (brand new address, signed up but never confirmed,
    // or previously unsubscribed) requires a fresh confirmation click —
    // confirmedAt always resets to null here. Without this, an address
    // that confirmed once and later unsubscribed could be silently
    // reactivated by anyone who knows the address, with no consent step
    // and no email sent to notice it happened, since the "already
    // confirmed" skip above would fire on the stale confirmedAt.
    const subscriber = existing
      ? await tx.newsletterSubscriber.update({
          where: { id: existing.id },
          data: { unsubscribedAt: null, confirmedAt: null, locale: lang },
        })
      : await tx.newsletterSubscriber.create({
          data: { businessId: business.id, email: parsed.data.email, locale: lang },
        });

    await tx.notificationJob.create({
      data: {
        businessId: business.id,
        channel: "EMAIL",
        templateKey: "newsletter.confirm",
        recipientEmail: subscriber.email,
        locale: lang,
        payload: {
          confirmUrl: `${appOrigin()}/newsletter/confirm/${subscriber.unsubscribeToken}`,
        },
        // Scoped to this write, not just the subscriber, since the same
        // address can legitimately go through this cycle more than once
        // (confirm, unsubscribe, resubscribe) — a key scoped only to
        // subscriber.id would collide on the second cycle.
        dedupeKey: `newsletter:${subscriber.id}:confirm:${Date.now()}`,
      },
    });
  });

  return { ok: true };
}

export type ConfirmSubscriptionResult = { ok: true } | { ok: false; error: "not_found" };

/** Same no-session, token-is-the-auth pattern as unsubscribeAction below — clicking twice is a no-op, not an error. */
export async function confirmSubscriptionAction(token: string): Promise<ConfirmSubscriptionResult> {
  const subscriber = await prisma.newsletterSubscriber.findUnique({ where: { unsubscribeToken: token } });
  if (!subscriber) return { ok: false, error: "not_found" };

  if (!subscriber.confirmedAt) {
    await prisma.newsletterSubscriber.update({
      where: { id: subscriber.id },
      data: { confirmedAt: new Date() },
    });
  }

  return { ok: true };
}

export type UnsubscribeResult = { ok: true } | { ok: false; error: "not_found" };

/**
 * No session required, by design — the only proof of identity is the
 * unguessable token in the email link itself (same cuid(2) capability-token
 * pattern as Order.publicToken). Idempotent: unsubscribing twice is a no-op,
 * not an error.
 */
export async function unsubscribeAction(token: string): Promise<UnsubscribeResult> {
  const subscriber = await prisma.newsletterSubscriber.findUnique({
    where: { unsubscribeToken: token },
  });
  if (!subscriber) return { ok: false, error: "not_found" };

  if (!subscriber.unsubscribedAt) {
    await prisma.newsletterSubscriber.update({
      where: { id: subscriber.id },
      data: { unsubscribedAt: new Date() },
    });
  }

  return { ok: true };
}
