"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/lib/generated/prisma/client";
import { requireRoleInAnyState } from "@/lib/auth/permissions";
import { organizationOwner } from "@/lib/billing/owner";
import { ensureSubscription } from "@/lib/billing/start";
import {
  attachCardToSubscription,
  billingEnabled,
  createCardSetupSession,
  createPortalSession,
  createSubscriptionCheckout,
  paymentMethodOnFile,
  priceForPlan,
  retrieveSubscription,
} from "@/lib/stripe/billing";
import { PLANS, TRIAL_PLAN, planForLookupKey, quantityFor } from "@/lib/billing/plans";
import { organizationBusinessIds } from "@/lib/billing/organization";
import { assertNotDemo } from "@/lib/demo/mode";

const PAGE = "/admin/suscripcion";

/*
 * The billing page's three buttons, for the organization's owner only. Each
 * one sends the owner to Stripe and changes nothing here: what they do there
 * comes back through the webhook.
 */

export async function startTrialAction(): Promise<void> {
  const owner = await organizationOwner(await requireRoleInAnyState(UserRole.BUSINESS_ADMIN));
  assertNotDemo("paying the platform subscription");
  let outcome = "error";
  if (billingEnabled()) {
    try {
      await ensureSubscription({ organizationId: owner.organizationId, businessId: owner.businessId, email: owner.email });
      outcome = "started";
      // The trial notice lives in the shell layout, which a redirect alone keeps as it was.
      revalidatePath("/admin", "layout");
    } catch (err) {
      console.error(`[billing] trial for organization ${owner.organizationId} did not start`, err);
    }
  }
  redirect(`${PAGE}?billing=${outcome}`);
}

export async function addCardAction(): Promise<void> {
  const owner = await organizationOwner(await requireRoleInAnyState(UserRole.BUSINESS_ADMIN));
  assertNotDemo("paying the platform subscription");
  const row = await prisma.organizationSubscription.findUnique({ where: { organizationId: owner.organizationId }, select: { stripeCustomerAccountId: true } });
  let url = `${PAGE}?billing=error`;
  if (row && billingEnabled()) {
    try {
      url = await createCardSetupSession({
        customerAccountId: row.stripeCustomerAccountId,
        organizationId: owner.organizationId,
        currency: owner.currency,
        // Arriving back proves nothing; the page says the card is being confirmed until the webhook says so.
        successUrl: `${owner.origin}${PAGE}?billing=card`,
        cancelUrl: `${owner.origin}${PAGE}`,
      });
    } catch (err) {
      console.error(`[billing] card setup for organization ${owner.organizationId} did not open`, err);
    }
  }
  redirect(url);
}

export async function openPortalAction(): Promise<void> {
  const owner = await organizationOwner(await requireRoleInAnyState(UserRole.BUSINESS_ADMIN));
  assertNotDemo("paying the platform subscription");
  const row = await prisma.organizationSubscription.findUnique({ where: { organizationId: owner.organizationId }, select: { stripeCustomerAccountId: true } });
  let url = `${PAGE}?billing=error`;
  if (row && billingEnabled()) {
    try {
      url = await createPortalSession({ customerAccountId: row.stripeCustomerAccountId, returnUrl: `${owner.origin}${PAGE}` });
    } catch (err) {
      console.error(`[billing] portal for organization ${owner.organizationId} did not open`, err);
    }
  }
  redirect(url);
}

/**
 * One button for an organization that is not paying (module 19, phase 8):
 * - a subscription that ended (canceled, expired) gets a new one through
 *   hosted Checkout, on the plan it had;
 * - one paused, past due or unpaid is charged now with the card on file;
 * - with no card on file, Checkout asks for one, and the webhook charges it.
 * What the owner sees afterwards still comes from the mirror the webhook
 * writes; the note on arrival only says what was attempted.
 */
export async function reactivateAction(): Promise<void> {
  const owner = await organizationOwner(await requireRoleInAnyState(UserRole.BUSINESS_ADMIN));
  assertNotDemo("paying the platform subscription");
  const row = await prisma.organizationSubscription.findUnique({ where: { organizationId: owner.organizationId } });
  let url = `${PAGE}?billing=error`;
  if (row?.stripeSubscriptionId && billingEnabled()) {
    const urls = { successUrl: `${owner.origin}${PAGE}?billing=card`, cancelUrl: `${owner.origin}${PAGE}` };
    try {
      const subscription = await retrieveSubscription(row.stripeSubscriptionId);
      if (subscription.status === "canceled" || subscription.status === "incomplete_expired") {
        const plan = planForLookupKey(row.planLookupKey) ?? TRIAL_PLAN;
        const [price, businessIds] = await Promise.all([priceForPlan(PLANS[plan].lookupKey), organizationBusinessIds(owner.organizationId)]);
        url = await createSubscriptionCheckout({
          customerAccountId: row.stripeCustomerAccountId,
          organizationId: owner.organizationId,
          price,
          quantity: quantityFor(plan, businessIds.length),
          ...urls,
        });
      } else {
        const paymentMethod = paymentMethodOnFile(subscription);
        if (paymentMethod) {
          url = `${PAGE}?billing=${(await attachCardToSubscription(subscription, paymentMethod)) ? "reactivated" : "declined"}`;
        } else {
          url = await createCardSetupSession({ customerAccountId: row.stripeCustomerAccountId, organizationId: owner.organizationId, currency: owner.currency, ...urls });
        }
      }
    } catch (err) {
      console.error(`[billing] reactivation for organization ${owner.organizationId} failed`, err);
    }
  }
  revalidatePath("/admin", "layout");
  redirect(url);
}
