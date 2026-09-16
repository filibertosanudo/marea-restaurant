import { Prisma } from "@/lib/generated/prisma/client";
import type { OrderType, PromotionType } from "@/lib/generated/prisma/client";
import {
  businessLocalDateParts,
  businessLocalMinutesOfDay,
  dayOfWeekFor,
} from "@/lib/reservations/availability";

/**
 * Given an order's lines and every promotion the business currently has,
 * which ones apply and for how much. Pure and framework-free, same
 * discipline as lib/reservations/availability.ts: no Prisma client, no
 * Date.now() inside, every clock/timezone value is a parameter — so
 * createOrderFromCart (the only caller) is the sole place a real clock or a
 * race on usageCount can influence the result. See docs/prompts/14 for the
 * confirmed design decisions this module implements.
 */

export type { PromotionType };

export type OrderLine = {
  menuItemId: string;
  unitPrice: Prisma.Decimal;
  quantity: number;
};

export type PromotionRule = {
  id: string;
  type: PromotionType;
  /** Code the customer types in. Null = automatic promotion, applies on its own. */
  code: string | null;
  value: Prisma.Decimal;
  minOrderTotal: Prisma.Decimal | null;
  maxDiscount: Prisma.Decimal | null;
  startsAt: Date | null;
  endsAt: Date | null;
  /** 0 = Sunday … 6 = Saturday, matching Date.getDay(). Empty = every day. */
  daysOfWeek: number[];
  startMinute: number | null;
  endMinute: number | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  appliesToOrderType: OrderType | null;
  isActive: boolean;
  createdAt: Date;
  /** menuItemId list from PromotionMenuItem. Empty = the whole order. */
  menuItemIds: string[];
};

export type AppliedDiscount = {
  promotionId: string;
  amount: Prisma.Decimal;
};

export type PromotionRejectionReason =
  | "not_found"
  | "not_active"
  | "not_yet_active"
  | "expired"
  | "wrong_day"
  | "wrong_time"
  | "wrong_order_type"
  | "min_order_not_met"
  | "no_matching_items"
  | "no_discount"
  | "usage_limit_reached"
  | "per_user_limit_reached";

export type ApplyPromotionsInput = {
  lines: OrderLine[];
  promotions: PromotionRule[];
  /** The code the guest typed at checkout, if any — matched case-insensitively. */
  code?: string;
  orderType: OrderType;
  now: Date;
  timezone: string;
  /** Global redemptions so far, keyed by promotion id. */
  usageByPromotion: Record<string, number>;
  /**
   * Redemptions so far by the ordering customer, keyed by promotion id.
   * Omit (or leave empty) for a guest checkout — perUserLimit only ever
   * applies to a real account; a limit dodged by typing a different email
   * isn't real enforcement, so a guest is never checked against it.
   */
  perUserUsageByPromotion?: Record<string, number>;
};

export type ApplyPromotionsResult = {
  discounts: AppliedDiscount[];
  discountTotal: Prisma.Decimal;
  /** Only set when `code` was given — lets checkout explain a rejection instead of a bare "invalid code". */
  codeResult?: { ok: true; promotionId: string } | { ok: false; reason: PromotionRejectionReason };
};

function lineTotal(line: OrderLine): Prisma.Decimal {
  return line.unitPrice.mul(line.quantity);
}

function sumLines(lines: OrderLine[]): Prisma.Decimal {
  return lines.reduce((sum, l) => sum.add(lineTotal(l)), new Prisma.Decimal(0));
}

function applicableLines(promo: PromotionRule, lines: OrderLine[]): OrderLine[] {
  if (promo.menuItemIds.length === 0) return lines;
  const scope = new Set(promo.menuItemIds);
  return lines.filter((l) => scope.has(l.menuItemId));
}

function checkEligibility(
  promo: PromotionRule,
  ctx: {
    orderType: OrderType;
    now: Date;
    timezone: string;
    orderSubtotal: Prisma.Decimal;
    applicableSubtotal: Prisma.Decimal;
    usageByPromotion: Record<string, number>;
    perUserUsageByPromotion: Record<string, number>;
  }
): { ok: true } | { ok: false; reason: PromotionRejectionReason } {
  if (!promo.isActive) return { ok: false, reason: "not_active" };
  if (promo.startsAt && ctx.now < promo.startsAt) return { ok: false, reason: "not_yet_active" };
  if (promo.endsAt && ctx.now > promo.endsAt) return { ok: false, reason: "expired" };
  if (promo.appliesToOrderType && promo.appliesToOrderType !== ctx.orderType) {
    return { ok: false, reason: "wrong_order_type" };
  }
  if (promo.daysOfWeek.length > 0) {
    const localDate = businessLocalDateParts(ctx.now, ctx.timezone);
    if (!promo.daysOfWeek.includes(dayOfWeekFor(localDate))) {
      return { ok: false, reason: "wrong_day" };
    }
  }
  if (promo.startMinute !== null && promo.endMinute !== null) {
    const minute = businessLocalMinutesOfDay(ctx.now, ctx.timezone);
    // start > end means the window wraps past midnight (e.g. 22:00–02:00).
    const inWindow =
      promo.startMinute <= promo.endMinute
        ? minute >= promo.startMinute && minute < promo.endMinute
        : minute >= promo.startMinute || minute < promo.endMinute;
    if (!inWindow) return { ok: false, reason: "wrong_time" };
  }
  if (promo.minOrderTotal && ctx.orderSubtotal.lessThan(promo.minOrderTotal)) {
    return { ok: false, reason: "min_order_not_met" };
  }
  if (promo.menuItemIds.length > 0 && ctx.applicableSubtotal.isZero()) {
    return { ok: false, reason: "no_matching_items" };
  }
  if (promo.usageLimit !== null && (ctx.usageByPromotion[promo.id] ?? 0) >= promo.usageLimit) {
    return { ok: false, reason: "usage_limit_reached" };
  }
  if (
    promo.perUserLimit !== null &&
    (ctx.perUserUsageByPromotion[promo.id] ?? 0) >= promo.perUserLimit
  ) {
    return { ok: false, reason: "per_user_limit_reached" };
  }
  return { ok: true };
}

/**
 * FREE_ITEM gives away one unit of the cheapest matching dish. The schema
 * has no "buy N, get 1 free" quantity field — only which items are in scope
 * (PromotionMenuItem) — so this fires on a single matching unit too; the
 * admin creates the purchase condition with the promotion's own other rules
 * (minOrderTotal, etc.), confirmed as the intended reading for this phase.
 */
function computeDiscountAmount(
  promo: PromotionRule,
  scoped: OrderLine[],
  applicableSubtotal: Prisma.Decimal
): Prisma.Decimal {
  if (applicableSubtotal.isZero()) return new Prisma.Decimal(0);

  let amount: Prisma.Decimal;
  switch (promo.type) {
    case "PERCENTAGE":
      amount = applicableSubtotal.mul(promo.value).div(100);
      break;
    case "FIXED_AMOUNT":
      amount = promo.value;
      break;
    case "BUNDLE_PRICE":
      // The matching lines collapse to one flat price — only a real saving
      // once the cart's actual cost for them is higher than that price.
      amount = applicableSubtotal.minus(promo.value);
      break;
    case "FREE_ITEM": {
      const cheapest = scoped.reduce<Prisma.Decimal | null>(
        (min, l) => (min === null || l.unitPrice.lessThan(min) ? l.unitPrice : min),
        null
      );
      amount = cheapest ?? new Prisma.Decimal(0);
      break;
    }
    default: {
      const exhaustive: never = promo.type;
      throw new Error(`Unhandled promotion type: ${String(exhaustive)}`);
    }
  }

  if (promo.maxDiscount) amount = Prisma.Decimal.min(amount, promo.maxDiscount);
  amount = Prisma.Decimal.max(amount, new Prisma.Decimal(0));
  return Prisma.Decimal.min(amount, applicableSubtotal).toDecimalPlaces(2);
}

/**
 * Every eligible promotion computes its discount against the order's
 * ORIGINAL lines, independently — amounts are summed, never applied
 * sequentially against a running discounted total. Confirmed for module 14:
 * two 50%-off promotions stack to 100% off (capped below at the order's own
 * subtotal), not 75% via compounding. Addition being commutative also means
 * there's no "which one applies first" to get wrong.
 */
/**
 * The one place code casing gets normalized for matching — both this
 * engine's checkout-time lookup and the admin CRUD form that saves
 * `Promotion.code` (lib/promotions/actions.ts) call this, so the two can
 * never drift into two different rules. Without a single shared function,
 * "WELCOME15" and "welcome15" risk becoming two distinct, silently
 * non-colliding codes if either side's normalization ever changes alone.
 */
export function normalizePromotionCode(code: string | null | undefined): string | null {
  const trimmed = code?.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

export function applyPromotions(input: ApplyPromotionsInput): ApplyPromotionsResult {
  const orderSubtotal = sumLines(input.lines);
  const perUserUsage = input.perUserUsageByPromotion ?? {};
  const normalizedCode = normalizePromotionCode(input.code) ?? undefined;

  function evaluate(promo: PromotionRule) {
    const scoped = applicableLines(promo, input.lines);
    const applicableSubtotal = sumLines(scoped);
    const check = checkEligibility(promo, {
      orderType: input.orderType,
      now: input.now,
      timezone: input.timezone,
      orderSubtotal,
      applicableSubtotal,
      usageByPromotion: input.usageByPromotion,
      perUserUsageByPromotion: perUserUsage,
    });
    if (!check.ok) return check;
    const amount = computeDiscountAmount(promo, scoped, applicableSubtotal);
    return amount.greaterThan(0) ? { ok: true as const, amount } : { ok: false as const, reason: "no_discount" as const };
  }

  const discounts: AppliedDiscount[] = [];

  // Automatic promotions (code: null) apply on their own, regardless of
  // whether a code was also entered. Sorted for a deterministic rounding
  // remainder below, not because order affects the math.
  const automatic = input.promotions
    .filter((p) => p.code === null)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  for (const promo of automatic) {
    const result = evaluate(promo);
    if (result.ok) discounts.push({ promotionId: promo.id, amount: result.amount });
  }

  // At most one entered code, matched case-insensitively against exactly
  // the promotion whose own `code` equals it.
  let codeResult: ApplyPromotionsResult["codeResult"];
  if (normalizedCode) {
    const promo = input.promotions.find((p) => normalizePromotionCode(p.code) === normalizedCode);
    if (!promo) {
      codeResult = { ok: false, reason: "not_found" };
    } else {
      const result = evaluate(promo);
      if (result.ok) {
        discounts.push({ promotionId: promo.id, amount: result.amount });
        codeResult = { ok: true, promotionId: promo.id };
      } else {
        codeResult = result;
      }
    }
  }

  // Combined discount can never exceed what the order is actually worth.
  // Scaling only engages when several large promotions stack past 100% of
  // the subtotal; the last discount absorbs the rounding remainder and is
  // clamped at zero — per-promotion rounding on the others could otherwise
  // push it negative.
  const rawTotal = discounts.reduce((sum, d) => sum.add(d.amount), new Prisma.Decimal(0));
  if (rawTotal.greaterThan(orderSubtotal) && rawTotal.greaterThan(0)) {
    const scale = orderSubtotal.div(rawTotal);
    let allocated = new Prisma.Decimal(0);
    discounts.forEach((discount, i) => {
      if (i === discounts.length - 1) {
        discount.amount = Prisma.Decimal.max(
          orderSubtotal.minus(allocated),
          new Prisma.Decimal(0)
        ).toDecimalPlaces(2);
      } else {
        discount.amount = discount.amount.mul(scale).toDecimalPlaces(2);
        allocated = allocated.add(discount.amount);
      }
    });
  }

  const discountTotal = discounts.reduce((sum, d) => sum.add(d.amount), new Prisma.Decimal(0));
  return { discounts, discountTotal, codeResult };
}
