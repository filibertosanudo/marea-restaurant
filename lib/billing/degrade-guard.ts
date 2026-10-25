import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { runInTenant } from "@/lib/tenancy/context";
import { getOpeningHours } from "@/lib/reservations/queries";
import { getPublicBusiness } from "@/lib/business";
import { isPlatformReadOnly, ReadOnlyModeError, type ReadOnlyStatus } from "@/lib/ops/read-only";
import { atLeast, effectiveLevel, type DegradeLevel } from "@/lib/billing/degrade";
import type { OpeningHourWindow } from "@/lib/reservations/availability";

/**
 * Where the degrade ladder (lib/billing/degrade.ts) meets requests: the step a
 * business is on, and the guards that act on it. The organization's own
 * read-only, the seam lib/ops/read-only.ts left for module 19.
 *
 * Never consulted by the Stripe webhooks: a guard that refused the
 * invoice.paid that lifts the ladder would keep it down for good.
 */

export type DegradeState = {
  level: DegradeLevel;
  lapsedSince: Date | null;
  timezone: string;
  hours: OpeningHourWindow[];
};

const NONE: Omit<DegradeState, "timezone" | "hours"> = { level: "NONE", lapsedSince: null };

/** Once per request: every guard and banner of one render asks the same question. */
export const degradeStateFor = cache(async (businessId: string): Promise<DegradeState> => {
  return runInTenant(businessId, async () => {
    const business = await prisma.business.findUnique({ where: { id: businessId }, select: { organizationId: true, timezone: true } });
    if (!business?.organizationId) return { ...NONE, timezone: business?.timezone ?? "UTC", hours: [] };
    const [row, hours] = await Promise.all([
      prisma.organizationSubscription.findUnique({ where: { organizationId: business.organizationId }, select: { lapsedSince: true } }),
      getOpeningHours(businessId),
    ]);
    const lapsedSince = row?.lapsedSince ?? null;
    return { level: effectiveLevel(lapsedSince, new Date(), hours, business.timezone), lapsedSince, timezone: business.timezone, hours };
  });
});

/** Thrown when the subscription's step forbids the write. A ReadOnlyModeError, so every caller that already handles maintenance handles this. */
export class SubscriptionDegradedError extends ReadOnlyModeError {
  level: DegradeLevel;
  constructor(level: DegradeLevel) {
    super(level === "SUSPENDED" ? "the restaurant's subscription is suspended" : "the restaurant's subscription is unpaid, so its configuration is read-only");
    this.name = "SubscriptionDegradedError";
    this.level = level;
  }
}

/**
 * What a panel write may do on the business's current step:
 * - "config": menu, prices, promotions, tables, team, settings. Stops at READ_ONLY.
 * - "operations": orders, kitchen, cash, payments, reservations, sold-out. Stops at SUSPENDED.
 */
export async function assertBusinessWritable(businessId: string, scope: "config" | "operations"): Promise<void> {
  const { level } = await degradeStateFor(businessId);
  if (atLeast(level, "SUSPENDED") || (scope === "config" && atLeast(level, "READ_ONLY"))) {
    throw new SubscriptionDegradedError(level);
  }
}

/**
 * The guests' writes (cart, checkout, reservations, newsletter, reviews): the
 * platform's own read-only, and a suspended restaurant, which takes no new
 * orders or bookings. Same shape as isPlatformReadOnly, so each guest action
 * only changes which function it asks.
 */
export async function guestWritesBlocked(): Promise<ReadOnlyStatus> {
  const platform = await isPlatformReadOnly();
  if (platform.enabled) return platform;
  const business = await getPublicBusiness();
  const { level } = await degradeStateFor(business.id);
  return level === "SUSPENDED" ? { enabled: true, reason: "suspended" } : { enabled: false, reason: null };
}
