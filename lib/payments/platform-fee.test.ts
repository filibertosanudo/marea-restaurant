import { describe, expect, it } from "vitest";
import { applicationFeeParams, platformFeeAmount } from "@/lib/payments/platform-fee";

describe("platformFeeAmount", () => {
  // Pinned on purpose. Charging a fee is not just changing this number: a
  // refund would then have to give it back (see the comment on the function),
  // and that needs the fee recorded on the Payment. Whoever changes this to a
  // positive value has to do that work in the same change, and edit this test.
  it("is zero for every amount: the platform takes no fee today", () => {
    for (const amount of [0, 1, 100, 2319, 1_000_000]) expect(platformFeeAmount(amount)).toBe(0);
  });
});

describe("applicationFeeParams", () => {
  it("sends nothing for no fee: Stripe rejects a zero application_fee_amount", () => {
    expect(applicationFeeParams(0)).toEqual({});
    expect(applicationFeeParams(platformFeeAmount(2319))).not.toHaveProperty("application_fee_amount");
  });

  it("sends the amount for a positive fee", () => {
    expect(applicationFeeParams(150)).toEqual({ application_fee_amount: 150 });
  });
});
