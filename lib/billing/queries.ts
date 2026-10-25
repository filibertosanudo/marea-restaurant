import "server-only";
import { prisma } from "@/lib/prisma";
import type { PlanId } from "@/lib/billing/plans";
import { planForLookupKey } from "@/lib/billing/plans";
import type { SubscriptionStatus } from "@/lib/generated/prisma/client";

/** What the billing page and the trial notice show, dates already resolved on the server. */
export type SubscriptionSummary = {
  status: SubscriptionStatus;
  plan: PlanId | null;
  quantity: number;
  trialEndsAt: string | null;
  /** Whole days left in the trial, rounded up; null outside a trial. */
  trialDaysLeft: number | null;
  currentPeriodEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  hasPaymentMethod: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** The subscription of the organization the request's business belongs to; null when it has none (operator-created, or Stripe not configured). */
export async function getSubscriptionSummary(organizationId: string, now = new Date()): Promise<SubscriptionSummary | null> {
  const row = await prisma.organizationSubscription.findUnique({ where: { organizationId } });
  if (!row) return null;
  const inTrial = row.status === "TRIALING" && row.trialEndsAt !== null;
  return {
    status: row.status,
    plan: planForLookupKey(row.planLookupKey),
    quantity: row.quantity,
    trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
    trialDaysLeft: inTrial ? Math.max(0, Math.ceil((row.trialEndsAt!.getTime() - now.getTime()) / DAY_MS)) : null,
    currentPeriodEndsAt: row.currentPeriodEndsAt?.toISOString() ?? null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    hasPaymentMethod: row.hasPaymentMethod,
  };
}
