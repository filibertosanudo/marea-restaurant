import "server-only";
import { prisma } from "@/lib/prisma";
import { PLANS, TRIAL_PLAN, planForLookupKey, type PlanId } from "@/lib/billing/plans";
import { organizationBusinessIds } from "@/lib/billing/organization";

export type BranchAllowance = {
  /** null: the platform does not bill this organization (created by the operator, before subscriptions). */
  plan: PlanId | null;
  /** Branches the plan allows; null for no limit. */
  max: number | null;
  count: number;
  stripeSubscriptionId: string | null;
};

/**
 * How many branches an organization has and may have (module 19, phase 7).
 * Limits are branches only, by the owner's decision: nothing is counted per
 * order or per user. A subscription with no plan yet (a start that stopped
 * half way) is held to the trial's plan.
 */
export async function branchAllowance(organizationId: string): Promise<BranchAllowance> {
  const [row, businessIds] = await Promise.all([
    prisma.organizationSubscription.findUnique({ where: { organizationId }, select: { planLookupKey: true, stripeSubscriptionId: true } }),
    organizationBusinessIds(organizationId),
  ]);
  if (!row) return { plan: null, max: null, count: businessIds.length, stripeSubscriptionId: null };
  const plan = planForLookupKey(row.planLookupKey) ?? TRIAL_PLAN;
  return { plan, max: PLANS[plan].maxBusinesses, count: businessIds.length, stripeSubscriptionId: row.stripeSubscriptionId };
}

export function atBranchLimit(allowance: BranchAllowance): boolean {
  return allowance.max !== null && allowance.count >= allowance.max;
}
