"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/lib/generated/prisma/client";
import { ForbiddenError, requireRole } from "@/lib/auth/permissions";
import type { Session } from "next-auth";
import { getBusinessForRequest } from "@/lib/business";
import { businessOrigin } from "@/lib/business-origin";
import { ensureSubscription } from "@/lib/billing/start";
import { billingEnabled, createCardSetupSession, createPortalSession } from "@/lib/stripe/billing";

/**
 * The billing page's three buttons. Each one sends the owner to Stripe and
 * changes nothing here: what they do there comes back through the webhook.
 *
 * Only the organization's owner (ORG_ADMIN) pays its subscription. A
 * BUSINESS_ADMIN of one branch of a chain runs that branch, not the account.
 */
async function organizationOwner(session: Session) {
  if (!session.user.orgAdmin || !session.user.businessId) throw new ForbiddenError("Only the organization's owner manages its subscription");
  const [user, business] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { organizationId: true, email: true } }),
    getBusinessForRequest(),
  ]);
  // authorizeBusiness already tied the session's business to the owner's
  // organization; checked again because this one decides who pays.
  if (!user.organizationId || user.organizationId !== business.organizationId) {
    throw new ForbiddenError("Only the organization's owner manages its subscription");
  }
  return { organizationId: user.organizationId, email: user.email, businessId: business.id, origin: businessOrigin(business), currency: business.currency };
}

const PAGE = "/admin/suscripcion";

export async function startTrialAction(): Promise<void> {
  const owner = await organizationOwner(await requireRole(UserRole.BUSINESS_ADMIN));
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
  const owner = await organizationOwner(await requireRole(UserRole.BUSINESS_ADMIN));
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
  const owner = await organizationOwner(await requireRole(UserRole.BUSINESS_ADMIN));
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
