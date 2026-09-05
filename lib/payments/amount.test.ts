import { describe, it, expect } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import { toStripeAmount } from "./amount";

describe("toStripeAmount", () => {
  it("converts a decimal amount to Stripe's minimum-unit integer", () => {
    expect(toStripeAmount(new Prisma.Decimal("42.00"))).toBe(4200);
  });

  it("handles a decimal that would be lossy in float arithmetic", () => {
    expect(toStripeAmount(new Prisma.Decimal("19.99"))).toBe(1999);
  });

  it("rounds away a stray sub-cent value instead of passing it through", () => {
    expect(toStripeAmount(new Prisma.Decimal("10.005"))).toBe(1001);
  });
});
