import { describe, expect, it } from "vitest";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { describePromotion } from "./describe";

const en = getDictionary("en");
const es = getDictionary("es");

function rule(overrides: Partial<Parameters<typeof describePromotion>[0]> = {}) {
  return {
    type: "PERCENTAGE" as const,
    value: "20",
    code: null,
    daysOfWeek: [],
    startMinute: null,
    endMinute: null,
    minOrderTotal: null,
    maxDiscount: null,
    ...overrides,
  };
}

describe("describePromotion", () => {
  it("matches the module's own example sentence in English", () => {
    const sentence = describePromotion(
      rule({ daysOfWeek: [5, 6, 0], startMinute: 18 * 60, endMinute: 22 * 60, minOrderTotal: "300", maxDiscount: "100" }),
      en,
      "en"
    );
    expect(sentence).toBe("20% off, Friday to Sunday from 18:00–22:00, on orders over $300, up to $100 off.");
  });

  it("matches the module's own example sentence in Spanish", () => {
    const sentence = describePromotion(
      rule({ daysOfWeek: [5, 6, 0], startMinute: 18 * 60, endMinute: 22 * 60, minOrderTotal: "300", maxDiscount: "100" }),
      es,
      "es"
    );
    expect(sentence).toBe(
      "20% de descuento, viernes a domingo de 18:00–22:00, en pedidos de más de $300, máximo $100 de descuento."
    );
  });

  it("omits the days/time clause entirely when neither is set", () => {
    expect(describePromotion(rule(), en, "en")).toBe("20% off.");
  });

  it("prefixes the sentence with the code when one is set", () => {
    const sentence = describePromotion(rule({ code: "welcome15" }), en, "en");
    expect(sentence).toBe("WELCOME15: 20% off.");
  });

  it("describes FIXED_AMOUNT, BUNDLE_PRICE, and FREE_ITEM leads", () => {
    expect(describePromotion(rule({ type: "FIXED_AMOUNT", value: "50" }), en, "en")).toBe("$50 off.");
    expect(describePromotion(rule({ type: "BUNDLE_PRICE", value: "59" }), en, "en")).toBe("Combo for $59.");
    expect(describePromotion(rule({ type: "FREE_ITEM" }), en, "en")).toBe("A free item.");
  });

  it("applies maxDiscount's clause to every type, matching the engine's own unconditional cap", () => {
    const sentence = describePromotion(rule({ type: "FIXED_AMOUNT", value: "50", maxDiscount: "30" }), en, "en");
    expect(sentence).toBe("$50 off, up to $30 off.");
  });
});
