import { describe, it, expect } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import { decimalToString, toIntlLocale, formatMoney, addMoneyStrings, mulMoneyString } from "./money";

describe("decimalToString", () => {
  it("formats a Decimal to two places", () => {
    expect(decimalToString(new Prisma.Decimal("10"))).toBe("10.00");
  });

  it("returns null for null or undefined", () => {
    expect(decimalToString(null)).toBeNull();
    expect(decimalToString(undefined)).toBeNull();
  });
});

describe("toIntlLocale", () => {
  it("maps es to es-MX and everything else to en-US", () => {
    expect(toIntlLocale("es")).toBe("es-MX");
    expect(toIntlLocale("en")).toBe("en-US");
  });
});

describe("formatMoney", () => {
  it("formats a numeric string as currency in the given locale", () => {
    expect(formatMoney("19.99", "USD", "en")).toContain("19.99");
  });
});

describe("addMoneyStrings", () => {
  it("sums money strings using cent-integer arithmetic", () => {
    expect(addMoneyStrings("10.10", "5.05")).toBe("15.15");
  });
});

describe("mulMoneyString", () => {
  it("multiplies a money string by a quantity", () => {
    expect(mulMoneyString("3.33", 3)).toBe("9.99");
  });
});
