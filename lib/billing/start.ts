import "server-only";
import { prisma } from "@/lib/prisma";
import { runInTenant } from "@/lib/tenancy/context";
import { createBillingCustomer, priceForPlan, startTrialSubscription, type BillingStripe } from "@/lib/stripe/billing";
import { PLANS, TRIAL_PLAN, quantityFor } from "@/lib/billing/plans";
import { mirrorOf } from "@/lib/billing/mirror";
import { organizationBusinessIds } from "@/lib/billing/organization";
import type { OrganizationSubscription } from "@/lib/generated/prisma/client";

/**
 * Gives an organization its payer and its trial, once. Called when a signup
 * verifies its email (the organization only becomes real then, and an
 * unverified one that gets purged never touched Stripe), and again from the
 * billing page for one whose first attempt failed: each step is skipped when
 * its id is already stored, and each Stripe call carries an idempotency key
 * per organization, so running it twice, or concurrently, makes one of each.
 *
 * The customer account is stored before the subscription is created, so a
 * failure in between leaves a NOT_STARTED row to finish rather than an
 * account in Stripe nothing here knows about.
 */
export async function ensureSubscription(
  input: { organizationId: string; businessId: string; email: string | null },
  client?: BillingStripe
): Promise<OrganizationSubscription> {
  const { organizationId } = input;
  return runInTenant(input.businessId, async () => {
    let row = await prisma.organizationSubscription.findUnique({ where: { organizationId } });
    if (row?.stripeSubscriptionId) return row;

    if (!row) {
      const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } });
      const customerAccountId = await createBillingCustomer({ organizationId, name: organization.name, email: input.email }, client);
      row = await prisma.organizationSubscription.upsert({
        where: { organizationId },
        create: { organizationId, stripeCustomerAccountId: customerAccountId },
        update: {},
      });
    }

    const [price, businessIds] = await Promise.all([priceForPlan(PLANS[TRIAL_PLAN].lookupKey, client), organizationBusinessIds(organizationId)]);
    const subscription = await startTrialSubscription(
      { organizationId, customerAccountId: row.stripeCustomerAccountId, price, quantity: quantityFor(TRIAL_PLAN, businessIds.length) },
      client
    );
    // Stripe's own answer to the create call, not a redirect: the one write
    // outside the webhook, and the webhook overwrites it from a retrieve anyway.
    return prisma.organizationSubscription.update({ where: { organizationId }, data: { ...mirrorOf(subscription), syncedAt: new Date() } });
  });
}
