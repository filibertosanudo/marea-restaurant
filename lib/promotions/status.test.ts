import { describe, expect, it } from "vitest";
import { getPromotionStatus } from "./status";

const NOW = new Date("2026-06-15T12:00:00Z");

function promo(overrides: Partial<Parameters<typeof getPromotionStatus>[0]> = {}) {
  return {
    isActive: true,
    startsAt: null,
    endsAt: null,
    usageLimit: null,
    usageCount: 0,
    ...overrides,
  };
}

describe("getPromotionStatus", () => {
  it("is inactive when isActive is false, regardless of dates", () => {
    expect(getPromotionStatus(promo({ isActive: false }), NOW)).toBe("inactive");
  });

  it("is upcoming before startsAt", () => {
    expect(getPromotionStatus(promo({ startsAt: new Date("2026-07-01T00:00:00Z") }), NOW)).toBe("upcoming");
  });

  it("is expired after endsAt", () => {
    expect(getPromotionStatus(promo({ endsAt: new Date("2026-06-01T00:00:00Z") }), NOW)).toBe("expired");
  });

  it("is exhausted once usageCount reaches usageLimit", () => {
    expect(getPromotionStatus(promo({ usageLimit: 10, usageCount: 10 }), NOW)).toBe("exhausted");
    expect(getPromotionStatus(promo({ usageLimit: 10, usageCount: 9 }), NOW)).toBe("active");
  });

  it("is active with no dates and no limit reached", () => {
    expect(getPromotionStatus(promo(), NOW)).toBe("active");
  });
});
