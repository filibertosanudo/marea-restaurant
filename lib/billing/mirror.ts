import type Stripe from "stripe";
import { SubscriptionStatus } from "@/lib/generated/prisma/client";

/**
 * What OrganizationSubscription stores about a Stripe subscription, read from
 * the subscription itself. Every write after creation goes through this from
 * a fresh retrieve, never from the object an event happened to carry, so a
 * late or repeated event cannot put an older state back.
 */
export type SubscriptionMirror = {
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  planLookupKey: string | null;
  quantity: number;
  trialEndsAt: Date | null;
  currentPeriodEndsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  hasPaymentMethod: boolean;
};

const STATUS: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
  trialing: SubscriptionStatus.TRIALING,
  active: SubscriptionStatus.ACTIVE,
  past_due: SubscriptionStatus.PAST_DUE,
  unpaid: SubscriptionStatus.UNPAID,
  paused: SubscriptionStatus.PAUSED,
  canceled: SubscriptionStatus.CANCELED,
  incomplete: SubscriptionStatus.INCOMPLETE,
  incomplete_expired: SubscriptionStatus.INCOMPLETE_EXPIRED,
};

const fromUnix = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000) : null);

export function mirrorOf(subscription: Stripe.Subscription): SubscriptionMirror {
  const item = subscription.items.data[0];
  const customer = typeof subscription.customer === "object" && !subscription.customer.deleted ? subscription.customer : null;
  return {
    stripeSubscriptionId: subscription.id,
    status: STATUS[subscription.status],
    planLookupKey: item?.price.lookup_key ?? null,
    quantity: item?.quantity ?? 1,
    trialEndsAt: fromUnix(subscription.trial_end),
    // Per item since API 2025-03-31; the plan has one.
    currentPeriodEndsAt: fromUnix(item?.current_period_end),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    // Stripe charges the subscription's own card, else its customer's default.
    hasPaymentMethod: Boolean(subscription.default_payment_method ?? customer?.invoice_settings?.default_payment_method),
  };
}
