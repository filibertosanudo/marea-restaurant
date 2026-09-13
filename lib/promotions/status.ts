export type PromotionStatus = "active" | "upcoming" | "expired" | "exhausted" | "inactive";

/**
 * The list page's status badge — the overall campaign window, not
 * right-this-minute eligibility (daysOfWeek/startMinute/endMinute are a
 * daily happy-hour-style detail engine.ts checks per order, not something a
 * "vigente/vencida/programada" badge needs to resolve).
 */
export function getPromotionStatus(
  promo: {
    isActive: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
    usageLimit: number | null;
    usageCount: number;
  },
  now: Date
): PromotionStatus {
  if (!promo.isActive) return "inactive";
  if (promo.startsAt && now < promo.startsAt) return "upcoming";
  if (promo.endsAt && now > promo.endsAt) return "expired";
  if (promo.usageLimit !== null && promo.usageCount >= promo.usageLimit) return "exhausted";
  return "active";
}
