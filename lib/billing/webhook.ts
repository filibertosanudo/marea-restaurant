import "server-only";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { runInTenant } from "@/lib/tenancy/context";
import { organizationIdForBillingAccount } from "@/lib/tenancy/discover";
import { attachCardToSubscription, paymentMethodOfSetupSession, retrieveSubscription, setSubscriptionQuantity, type BillingStripe } from "@/lib/stripe/billing";
import { mirrorOf, type SubscriptionMirror } from "@/lib/billing/mirror";
import { PLANS, planForLookupKey, quantityFor } from "@/lib/billing/plans";
import { organizationBusinessIds } from "@/lib/billing/organization";
import { Prisma } from "@/lib/generated/prisma/client";

/**
 * The platform webhook's billing events (module 19, phase 6), and the only
 * writer of a subscription's state after it is created.
 *
 * Which events, and why these:
 * - customer.subscription.* (created, updated, deleted, paused, resumed,
 *   trial_will_end): every change of status, plan, quantity, period or
 *   cancellation arrives as one of these.
 * - invoice.paid and invoice.payment_failed: the moment money did or did not
 *   arrive. The status change follows as an update, but the invoice can come
 *   first, and invoice.paid is what lifts the degrade ladder (phase 8).
 * - checkout.session.completed in setup mode: the card a restaurant added
 *   through hosted Checkout, which this handler puts on the subscription.
 *
 * Each event only says "look again": the row is rewritten from a fresh
 * retrieve of the subscription, so the order events arrive in, a repeat, or a
 * stale payload cannot leave an older state behind. The event's id goes into
 * StripeWebhookEvent in the same transaction, as for payments.
 */

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "customer.subscription.trial_will_end",
]);
const INVOICE_EVENTS = new Set(["invoice.paid", "invoice.payment_failed"]);

function isCardSetupSession(event: Stripe.Event): event is Stripe.CheckoutSessionCompletedEvent {
  return event.type === "checkout.session.completed" && event.data.object.mode === "setup";
}

export function isBillingEvent(event: Stripe.Event): boolean {
  return SUBSCRIPTION_EVENTS.has(event.type) || INVOICE_EVENTS.has(event.type) || isCardSetupSession(event);
}

type BillingObject = { object?: string; id?: string; customer_account?: string | null; parent?: Stripe.Invoice.Parent | null };

/** The subscription an event names, when it names one: the subscription itself, or the one an invoice bills. */
function subscriptionIdOf(object: BillingObject): string | null {
  if (object.object === "subscription") return object.id ?? null;
  const ref = object.parent?.subscription_details?.subscription;
  if (typeof ref === "string") return ref;
  return ref?.id ?? null;
}

export type BillingOutcome = { ignored: string } | { applied: true };

export async function applyBillingEvent(event: Stripe.Event, client?: BillingStripe): Promise<BillingOutcome> {
  const object = event.data.object as BillingObject;
  const accountId = object.customer_account ?? null;
  if (!accountId) return { ignored: "names no customer account" };

  const organizationId = await organizationIdForBillingAccount(accountId);
  if (!organizationId) return { ignored: `customer account ${accountId} belongs to no organization` };
  const businessIds = await organizationBusinessIds(organizationId);
  const [businessId] = businessIds;
  if (!businessId) return { ignored: `organization ${organizationId} has no business` };

  return runInTenant(businessId, async () => {
    if (await prisma.stripeWebhookEvent.findUnique({ where: { eventId: event.id }, select: { id: true } })) return { applied: true } as const;

    const row = await prisma.organizationSubscription.findUniqueOrThrow({ where: { organizationId } });
    if (!row.stripeSubscriptionId) return { ignored: `organization ${organizationId} has no subscription yet` };
    const named = subscriptionIdOf(object);
    // The customer account matched; a subscription it names must too.
    if (named && named !== row.stripeSubscriptionId) {
      return { ignored: `names subscription ${named}, not ${row.stripeSubscriptionId} stored for ${organizationId}` };
    }

    if (isCardSetupSession(event)) {
      const paymentMethod = await paymentMethodOfSetupSession(event.data.object, client);
      if (paymentMethod) await attachCardToSubscription(await retrieveSubscription(row.stripeSubscriptionId, client), paymentMethod, client);
    }

    const fresh = mirrorOf(await retrieveSubscription(row.stripeSubscriptionId, client));
    await reconcileQuantity(fresh, businessIds.length, client);
    await prisma.$transaction(async (tx) => {
      await tx.stripeWebhookEvent.create({
        data: { eventId: event.id, type: event.type, payload: event as unknown as Prisma.InputJsonValue, processedAt: new Date() },
      });
      await tx.organizationSubscription.update({ where: { organizationId }, data: { ...fresh, syncedAt: new Date() } });
    });
    return { applied: true } as const;
  });
}

const LIVE = new Set(["TRIALING", "ACTIVE", "PAST_DUE"]);

/**
 * A per-branch plan bills for as many branches as the organization has (phase
 * 7). Adding a branch sets that at once; this catches what that missed (a
 * Stripe failure then, or a plan change in the portal) the next time Stripe
 * says anything about the subscription. Stripe's own update event then brings
 * the new quantity into the mirror.
 */
async function reconcileQuantity(mirror: SubscriptionMirror, branches: number, client?: BillingStripe): Promise<void> {
  const plan = planForLookupKey(mirror.planLookupKey);
  if (!plan || !PLANS[plan].perBusiness || !LIVE.has(mirror.status)) return;
  const wanted = quantityFor(plan, branches);
  if (mirror.quantity === wanted) return;
  try {
    await setSubscriptionQuantity(mirror.stripeSubscriptionId, wanted, client);
  } catch (err) {
    console.error(`[billing] could not set ${mirror.stripeSubscriptionId} to ${wanted} branches`, err);
  }
}
