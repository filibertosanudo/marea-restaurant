/**
 * The platform's plans, in the one place a number about them is allowed to
 * live (module 19). Prices are not here: they live in Stripe and are found by
 * lookup_key, so changing what a plan costs is a Stripe change, not a deploy.
 * The limits are the owner's decision and are only branches; nothing is
 * metered by orders.
 */

export type PlanId = "basico" | "pro" | "cadena";

export type Plan = {
  lookupKey: string;
  /** Branches (businesses) the organization may have; null for no limit. */
  maxBusinesses: number | null;
  /** Billed per branch: the subscription's quantity follows the branch count. */
  perBusiness: boolean;
};

export const PLANS: Record<PlanId, Plan> = {
  basico: { lookupKey: "marea_basico", maxBusinesses: 1, perBusiness: false },
  pro: { lookupKey: "marea_pro", maxBusinesses: 1, perBusiness: false },
  cadena: { lookupKey: "marea_cadena", maxBusinesses: null, perBusiness: true },
};

/** The plan a new signup's trial runs on. Changing plan is the billing portal's job. */
export const TRIAL_PLAN: PlanId = "basico";

export function planForLookupKey(lookupKey: string | null | undefined): PlanId | null {
  if (!lookupKey) return null;
  const entry = (Object.entries(PLANS) as Array<[PlanId, Plan]>).find(([, plan]) => plan.lookupKey === lookupKey);
  return entry?.[0] ?? null;
}

/** What the subscription's quantity should be for an organization with `businessCount` branches. */
export function quantityFor(plan: PlanId, businessCount: number): number {
  return PLANS[plan].perBusiness ? Math.max(1, businessCount) : 1;
}
