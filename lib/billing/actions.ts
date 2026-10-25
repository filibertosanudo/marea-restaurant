"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/lib/generated/prisma/client";
import { requireRoleInAnyState } from "@/lib/auth/permissions";
import { organizationOwner } from "@/lib/billing/owner";
import { ensureSubscription } from "@/lib/billing/start";
import { billingEnabled, createCardSetupSession, createPortalSession } from "@/lib/stripe/billing";

const PAGE = "/admin/suscripcion";

/*
 * The billing page's three buttons, for the organization's owner only. Each
 * one sends the owner to Stripe and changes nothing here: what they do there
 * comes back through the webhook.
 */

export async function startTrialAction(): Promise<void> {
  const owner = await organizationOwner(await requireRoleInAnyState(UserRole.BUSINESS_ADMIN));
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
