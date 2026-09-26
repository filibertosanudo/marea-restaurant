"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/permissions";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { getBusinessForRequest, invalidateBusinessCache } from "@/lib/business";
import { businessOrigin } from "@/lib/business-origin";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import type { Business, StripeCapabilityStatus } from "@/lib/generated/prisma/client";
import { createConnectedAccount, createOnboardingLink, readCardPaymentsStatus } from "@/lib/stripe/connect";
import { isUniqueConstraintError } from "@/lib/payments/prisma-errors";

/**
 * Connecting a business to its own Stripe account (module 17b, phase 3).
 *
 * Three rules hold everywhere in this file:
 *
 * 1. No account id ever comes from the caller. Neither action takes an argument.
 *    The id is written in exactly one place, right after this code created the
 *    account at Stripe, and read from the row afterwards. A field where an
 *    administrator could type `acct_...` would be a way to send the money of a
 *    business to an account that is not its own, or to point two businesses at one.
 * 2. One business, one account: the column is unique and a second connection
 *    attempt is a conditional update that changes nothing.
 * 3. Turning card payments on still goes through the server (settings action and
 *    stripe-actions): this file only learns and records what Stripe says the
 *    account can do.
 */

export type ConnectError =
  | "country_required"
  | "account_in_use"
  | "no_account"
  | "livemode_mismatch"
  | "stripe_unavailable";

export type StartOnboardingResult =
  | { ok: true; url: string }
  | { ok: true; done: true; status: StripeCapabilityStatus }
  | { ok: false; error: ConnectError };

export type RefreshStatusResult = { ok: true; status: StripeCapabilityStatus } | { ok: false; error: ConnectError };

/** The mode (live or test) of the key this deployment talks to Stripe with. An account of the other mode does not exist for that key. */
function keyIsLive(): boolean {
  return (env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_");
}

/** Records what Stripe says, for the account THIS row holds: if the row changed in between, nothing is written. */
async function saveStatus(business: Pick<Business, "id" | "slug">, accountId: string, status: StripeCapabilityStatus): Promise<void> {
  await prisma.business.updateMany({
    where: { id: business.id, stripeAccountId: accountId },
    data: { stripeCardPaymentsStatus: status, stripeStatusCheckedAt: new Date() },
  });
  invalidateBusinessCache(business);
  revalidatePath("/admin/configuracion");
}

/**
 * Starts, or resumes, onboarding: creates the account if this business has none,
 * and returns the single-use Stripe-hosted link to send the administrator to. An
 * account that is already active needs no link. Also what the `refresh_url` lands
 * on, when a link has expired or been used: the same call, a fresh link.
 */
export async function startStripeOnboardingAction(): Promise<StartOnboardingResult> {
  const session = await requireRole(...ADMIN_ROLES);
  const business = await getBusinessForRequest();

  // The country belongs to the restaurant, not to the deployment, and Stripe
  // cannot create the account without it.
  if (!business.country) return { ok: false, error: "country_required" };

  try {
    let accountId = business.stripeAccountId;

    if (!accountId) {
      const created = await createConnectedAccount({
        businessId: business.id,
        businessName: business.name,
        country: business.country,
        locale: business.defaultLocale === "en" ? "en" : "es",
        contactEmail: session.user.email,
      });

      try {
        const written = await prisma.business.updateMany({
          where: { id: business.id, stripeAccountId: null },
          data: { stripeAccountId: created.id, stripeCardPaymentsStatus: "PENDING", stripeStatusCheckedAt: new Date() },
        });
        if (written.count === 0) {
          // Another request connected it first; that is the account to use.
          const current = await prisma.business.findUniqueOrThrow({ where: { id: business.id }, select: { stripeAccountId: true } });
          if (!current.stripeAccountId) return { ok: false, error: "stripe_unavailable" };
          accountId = current.stripeAccountId;
        } else {
          accountId = created.id;
        }
      } catch (err) {
        if (isUniqueConstraintError(err)) return { ok: false, error: "account_in_use" };
        throw err;
      }
      invalidateBusinessCache(business);
    }

    const reading = await readCardPaymentsStatus(accountId);
    if (reading.livemode !== keyIsLive()) return { ok: false, error: "livemode_mismatch" };
    await saveStatus(business, accountId, reading.status);
    if (reading.status === "ACTIVE") return { ok: true, done: true, status: reading.status };

    const origin = businessOrigin(business);
    const link = await createOnboardingLink(accountId, {
      returnUrl: `${origin}/admin/configuracion?stripe=return`,
      refreshUrl: `${origin}/admin/configuracion?stripe=refresh`,
    });
    return { ok: true, url: link.url };
  } catch (err) {
    console.error("Stripe onboarding failed", err);
    return { ok: false, error: "stripe_unavailable" };
  }
}

/**
 * Re-reads the account this business holds and records its state. What the
 * `return_url` lands on: coming back from Stripe does not mean it finished, so
 * the answer is asked of Stripe, never assumed.
 */
export async function refreshStripeAccountAction(): Promise<RefreshStatusResult> {
  await requireRole(...ADMIN_ROLES);
  const business = await getBusinessForRequest();
  if (!business.stripeAccountId) return { ok: false, error: "no_account" };

  try {
    const reading = await readCardPaymentsStatus(business.stripeAccountId);
    if (reading.livemode !== keyIsLive()) return { ok: false, error: "livemode_mismatch" };
    await saveStatus(business, business.stripeAccountId, reading.status);
    return { ok: true, status: reading.status };
  } catch (err) {
    console.error("Stripe account refresh failed", err);
    return { ok: false, error: "stripe_unavailable" };
  }
}
