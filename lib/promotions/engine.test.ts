import { describe, expect, it } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import { localWallClockToUtc } from "@/lib/reservations/availability";
import { applyPromotions, type ApplyPromotionsInput, type OrderLine, type PromotionRule } from "./engine";

// America/Hermosillo is UTC-7 year-round (Sonora doesn't observe DST) — a
// deterministic zone to resolve exact local wall-clock instants against,
// matching Business.timezone's own default in schema.prisma.
const TIMEZONE = "America/Hermosillo";
const FRIDAY = { year: 2026, month: 2, day: 27 };
const THURSDAY = { year: 2026, month: 2, day: 26 };

function at(minutesFromMidnight: number, date = FRIDAY): Date {
  return localWallClockToUtc(date.year, date.month, date.day, minutesFromMidnight, TIMEZONE);
}

const NOON_FRIDAY = at(12 * 60);

function d(value: number | string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function line(overrides: Partial<OrderLine> = {}): OrderLine {
  return { menuItemId: "dish-1", unitPrice: d("100.00"), quantity: 1, ...overrides };
}

function promo(overrides: Partial<PromotionRule> = {}): PromotionRule {
  return {
    id: "promo-1",
    type: "PERCENTAGE",
    code: null,
    value: d(10),
    minOrderTotal: null,
    maxDiscount: null,
    startsAt: null,
    endsAt: null,
    daysOfWeek: [],
    startMinute: null,
    endMinute: null,
    usageLimit: null,
    perUserLimit: null,
    appliesToOrderType: null,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    menuItemIds: [],
    ...overrides,
  };
}

function baseInput(overrides: Partial<ApplyPromotionsInput> = {}): ApplyPromotionsInput {
  return {
    lines: [line()],
    promotions: [],
    orderType: "TAKEAWAY",
    now: NOON_FRIDAY,
    timezone: TIMEZONE,
    usageByPromotion: {},
    ...overrides,
  };
}

describe("applyPromotions — discount types", () => {
  it("PERCENTAGE discounts the applicable subtotal by value percent", () => {
    const result = applyPromotions(
      baseInput({ promotions: [promo({ type: "PERCENTAGE", value: d(20) })] })
    );
    expect(result.discounts).toEqual([{ promotionId: "promo-1", amount: d(20) }]);
    expect(result.discountTotal.toString()).toBe("20");
  });

  it("FIXED_AMOUNT discounts a flat amount, capped at the line's own total", () => {
    const cheap = applyPromotions(
      baseInput({
        lines: [line({ unitPrice: d("10.00") })],
        promotions: [promo({ type: "FIXED_AMOUNT", value: d(15) })],
      })
    );
    expect(cheap.discountTotal.toString()).toBe("10");

    const normal = applyPromotions(
      baseInput({ promotions: [promo({ type: "FIXED_AMOUNT", value: d(15) })] })
    );
    expect(normal.discountTotal.toString()).toBe("15");
  });

  it("BUNDLE_PRICE discounts the gap between the matching lines' real cost and the flat price", () => {
    const result = applyPromotions(
      baseInput({
        lines: [line({ menuItemId: "dish-1", unitPrice: d("40.00") }), line({ menuItemId: "dish-2", unitPrice: d("40.00") })],
        promotions: [
          promo({ type: "BUNDLE_PRICE", value: d(59), menuItemIds: ["dish-1", "dish-2"] }),
        ],
      })
    );
    expect(result.discountTotal.toString()).toBe("21"); // 80 - 59

    // The bundle price isn't actually cheaper than the cart — no discount.
    const noSaving = applyPromotions(
      baseInput({
        lines: [line({ menuItemId: "dish-1", unitPrice: d("25.00") }), line({ menuItemId: "dish-2", unitPrice: d("25.00") })],
        promotions: [
          promo({ type: "BUNDLE_PRICE", value: d(59), menuItemIds: ["dish-1", "dish-2"] }),
        ],
      })
    );
    expect(noSaving.discounts).toEqual([]);
  });

  it("FREE_ITEM gives away the cheapest matching dish", () => {
    const result = applyPromotions(
      baseInput({
        lines: [
          line({ menuItemId: "soda", unitPrice: d("30.00") }),
          line({ menuItemId: "water", unitPrice: d("20.00") }),
        ],
        promotions: [
          promo({ type: "FREE_ITEM", value: d(0), menuItemIds: ["soda", "water"] }),
        ],
      })
    );
    expect(result.discountTotal.toString()).toBe("20");
  });
});

describe("applyPromotions — validity rules", () => {
  it("skips an inactive promotion", () => {
    const result = applyPromotions(baseInput({ promotions: [promo({ isActive: false })] }));
    expect(result.discounts).toEqual([]);
  });

  it("respects startsAt / endsAt", () => {
    const notYet = applyPromotions(
      baseInput({ promotions: [promo({ startsAt: at(13 * 60) })] }) // starts this afternoon
    );
    expect(notYet.discounts).toEqual([]);

    const alreadyEnded = applyPromotions(
      baseInput({ promotions: [promo({ endsAt: at(11 * 60) })] }) // ended this morning
    );
    expect(alreadyEnded.discounts).toEqual([]);

    const withinWindow = applyPromotions(
      baseInput({ promotions: [promo({ startsAt: at(11 * 60), endsAt: at(13 * 60) })] })
    );
    expect(withinWindow.discounts).toHaveLength(1);
  });

  it("respects daysOfWeek, including a window that wraps past Saturday into Sunday", () => {
    const weekendOnly = promo({ daysOfWeek: [5, 6, 0] }); // Fri, Sat, Sun

    const onFriday = applyPromotions(baseInput({ now: at(12 * 60, FRIDAY), promotions: [weekendOnly] }));
    expect(onFriday.discounts).toHaveLength(1);

    const onThursday = applyPromotions(baseInput({ now: at(12 * 60, THURSDAY), promotions: [weekendOnly] }));
    expect(onThursday.discounts).toEqual([]);
  });

  it("respects a startMinute/endMinute happy-hour window", () => {
    const happyHour = promo({ startMinute: 18 * 60, endMinute: 22 * 60 }); // 18:00–22:00

    const inside = applyPromotions(baseInput({ now: at(20 * 60), promotions: [happyHour] }));
    expect(inside.discounts).toHaveLength(1);

    const before = applyPromotions(baseInput({ now: at(17 * 60), promotions: [happyHour] }));
    expect(before.discounts).toEqual([]);
  });

  it("resolves a time window that wraps past midnight", () => {
    const lateNight = promo({ startMinute: 22 * 60, endMinute: 2 * 60 }); // 22:00–02:00

    const lateEvening = applyPromotions(baseInput({ now: at(23 * 60), promotions: [lateNight] }));
    expect(lateEvening.discounts).toHaveLength(1);

    const earlyMorning = applyPromotions(baseInput({ now: at(1 * 60), promotions: [lateNight] }));
    expect(earlyMorning.discounts).toHaveLength(1);

    const midday = applyPromotions(baseInput({ now: at(12 * 60), promotions: [lateNight] }));
    expect(midday.discounts).toEqual([]);
  });

  it("respects minOrderTotal against the whole order, not just the promotion's own lines", () => {
    const minOrder = promo({ minOrderTotal: d(300) });

    const tooSmall = applyPromotions(baseInput({ lines: [line({ unitPrice: d("100.00") })], promotions: [minOrder] }));
    expect(tooSmall.discounts).toEqual([]);

    const bigEnough = applyPromotions(baseInput({ lines: [line({ unitPrice: d("300.00") })], promotions: [minOrder] }));
    expect(bigEnough.discounts).toHaveLength(1);
  });

  it("respects appliesToOrderType", () => {
    const dineInOnly = promo({ appliesToOrderType: "DINE_IN" });

    const takeaway = applyPromotions(baseInput({ orderType: "TAKEAWAY", promotions: [dineInOnly] }));
    expect(takeaway.discounts).toEqual([]);

    const dineIn = applyPromotions(baseInput({ orderType: "DINE_IN", promotions: [dineInOnly] }));
    expect(dineIn.discounts).toHaveLength(1);
  });

  it("doesn't apply an item-scoped promotion when none of its dishes are in the cart", () => {
    const result = applyPromotions(
      baseInput({
        lines: [line({ menuItemId: "dish-1" })],
        promotions: [promo({ menuItemIds: ["dish-2"] })],
      })
    );
    expect(result.discounts).toEqual([]);
  });
});

describe("applyPromotions — usage limits", () => {
  it("stops applying once the global usageLimit is reached", () => {
    const limited = promo({ id: "p1", usageLimit: 50 });

    const underLimit = applyPromotions(baseInput({ promotions: [limited], usageByPromotion: { p1: 49 } }));
    expect(underLimit.discounts).toHaveLength(1);

    const atLimit = applyPromotions(baseInput({ promotions: [limited], usageByPromotion: { p1: 50 } }));
    expect(atLimit.discounts).toEqual([]);
  });

  it("blocks a repeat customer once perUserLimit is reached", () => {
    const oncePerCustomer = promo({ id: "p1", perUserLimit: 1 });

    const result = applyPromotions(
      baseInput({ promotions: [oncePerCustomer], perUserUsageByPromotion: { p1: 1 } })
    );
    expect(result.discounts).toEqual([]);
  });

  it("never enforces perUserLimit for a guest checkout, even at a count that would otherwise block it", () => {
    const oncePerCustomer = promo({ id: "p1", perUserLimit: 1 });

    // No perUserUsageByPromotion at all — exactly what createOrderFromCart
    // passes for a guest, per the confirmed design decision.
    const result = applyPromotions(baseInput({ promotions: [oncePerCustomer] }));
    expect(result.discounts).toHaveLength(1);
  });
});

describe("applyPromotions — maxDiscount", () => {
  it("caps the discount at maxDiscount regardless of the computed percentage", () => {
    const result = applyPromotions(
      baseInput({
        lines: [line({ unitPrice: d("1000.00") })],
        promotions: [promo({ type: "PERCENTAGE", value: d(50), maxDiscount: d(100) })],
      })
    );
    expect(result.discountTotal.toString()).toBe("100");
  });
});

describe("applyPromotions — code", () => {
  it("applies the promotion matching the entered code, case-insensitively", () => {
    const result = applyPromotions(
      baseInput({ code: "welcome15", promotions: [promo({ code: "WELCOME15", value: d(15) })] })
    );
    expect(result.codeResult).toEqual({ ok: true, promotionId: "promo-1" });
    expect(result.discountTotal.toString()).toBe("15");
  });

  it("reports not_found for a code that matches no promotion", () => {
    const result = applyPromotions(baseInput({ code: "DOESNOTEXIST", promotions: [] }));
    expect(result.codeResult).toEqual({ ok: false, reason: "not_found" });
  });

  it("reports the specific reason a matched code isn't eligible right now", () => {
    const weekdayOnly = promo({ code: "WEEKDAY10", daysOfWeek: [1, 2, 3, 4] }); // Mon–Thu
    const result = applyPromotions(
      baseInput({ now: at(12 * 60, FRIDAY), code: "weekday10", promotions: [weekdayOnly] })
    );
    expect(result.codeResult).toEqual({ ok: false, reason: "wrong_day" });
    expect(result.discounts).toEqual([]);
  });

  it("still applies automatic promotions when the entered code doesn't match anything", () => {
    const result = applyPromotions(
      baseInput({
        code: "GARBAGE",
        promotions: [promo({ code: null, value: d(10) })],
      })
    );
    expect(result.codeResult).toEqual({ ok: false, reason: "not_found" });
    expect(result.discountTotal.toString()).toBe("10");
  });

  it("reports no_discount, not no_matching_items, for a code that matches items but isn't actually cheaper", () => {
    const noSaving = promo({
      code: "BUNDLE59",
      type: "BUNDLE_PRICE",
      value: d(59),
      menuItemIds: ["dish-1", "dish-2"],
    });
    const result = applyPromotions(
      baseInput({
        lines: [line({ menuItemId: "dish-1", unitPrice: d("25.00") }), line({ menuItemId: "dish-2", unitPrice: d("25.00") })],
        code: "bundle59",
        promotions: [noSaving],
      })
    );
    expect(result.codeResult).toEqual({ ok: false, reason: "no_discount" });
  });

  it("matches a code even when the promotion's own code has incidental whitespace", () => {
    const result = applyPromotions(
      baseInput({ code: "welcome15", promotions: [promo({ code: " WELCOME15 ", value: d(15) })] })
    );
    expect(result.codeResult).toEqual({ ok: true, promotionId: "promo-1" });
  });
});

describe("applyPromotions — combining several promotions", () => {
  it("sums two independently-eligible automatic promotions", () => {
    const result = applyPromotions(
      baseInput({
        lines: [line({ unitPrice: d("200.00") })],
        promotions: [
          promo({ id: "p1", type: "PERCENTAGE", value: d(10) }),
          promo({ id: "p2", type: "FIXED_AMOUNT", value: d(15) }),
        ],
      })
    );
    // 10% of 200 = 20, plus a flat 15.
    expect(result.discountTotal.toString()).toBe("35");
    expect(result.discounts).toHaveLength(2);
  });

  it("scales combined discounts down so they never exceed the order's own subtotal", () => {
    const result = applyPromotions(
      baseInput({
        lines: [line({ unitPrice: d("100.00") })],
        promotions: [
          promo({ id: "p1", type: "PERCENTAGE", value: d(70) }),
          promo({ id: "p2", type: "PERCENTAGE", value: d(60) }),
        ],
      })
    );
    expect(result.discountTotal.toString()).toBe("100");
    const sumOfRows = result.discounts.reduce((sum, dsc) => sum.add(dsc.amount), d(0));
    expect(sumOfRows.toString()).toBe("100");
  });

  it("never lets per-promotion rounding push the remainder-absorbing discount negative", () => {
    // Four 100%-off promotions on a $0.02 order: each computes a raw $0.02
    // discount (rawTotal $0.08), scaled by 0.25 to fit the $0.02 subtotal.
    // 0.02 * 0.25 = 0.005, which rounds up to 0.01 for each of the first
    // three, allocating 0.03 before the last discount is even computed —
    // already past the $0.02 subtotal.
    const result = applyPromotions(
      baseInput({
        lines: [line({ unitPrice: d("0.02") })],
        promotions: [
          promo({ id: "p1", type: "PERCENTAGE", value: d(100), createdAt: new Date("2026-01-01T00:00:00Z") }),
          promo({ id: "p2", type: "PERCENTAGE", value: d(100), createdAt: new Date("2026-01-02T00:00:00Z") }),
          promo({ id: "p3", type: "PERCENTAGE", value: d(100), createdAt: new Date("2026-01-03T00:00:00Z") }),
          promo({ id: "p4", type: "PERCENTAGE", value: d(100), createdAt: new Date("2026-01-04T00:00:00Z") }),
        ],
      })
    );
    for (const discount of result.discounts) {
      expect(discount.amount.greaterThanOrEqualTo(0)).toBe(true);
    }
    expect(result.discountTotal.greaterThanOrEqualTo(0)).toBe(true);
  });
});
