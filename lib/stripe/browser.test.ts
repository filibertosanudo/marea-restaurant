import { beforeEach, describe, expect, it, vi } from "vitest";

const loadStripe = vi.hoisted(() => vi.fn(async (key: string, options?: { stripeAccount?: string }) => ({ key, options })));
vi.mock("@stripe/stripe-js", () => ({ loadStripe }));

import { getStripe } from "@/lib/stripe/browser";

beforeEach(() => loadStripe.mockClear());

describe("getStripe", () => {
  it("loads Stripe.js for the connected account the intent lives on", async () => {
    await getStripe("pk_test_a", "acct_1");
    expect(loadStripe).toHaveBeenCalledWith("pk_test_a", { stripeAccount: "acct_1" });
  });

  it("loads it without an account for the platform's own", async () => {
    await getStripe("pk_test_b", null);
    expect(loadStripe).toHaveBeenCalledWith("pk_test_b", undefined);
  });

  it("reuses the instance for the same key and account, so the script is injected once", async () => {
    const first = getStripe("pk_test_c", "acct_1");
    const second = getStripe("pk_test_c", "acct_1");
    expect(second).toBe(first);
    expect(loadStripe).toHaveBeenCalledTimes(1);
  });

  it("never hands one account's instance to another account, or to the platform", async () => {
    const one = getStripe("pk_test_d", "acct_1");
    const two = getStripe("pk_test_d", "acct_2");
    const platform = getStripe("pk_test_d", null);
    expect(new Set([one, two, platform]).size).toBe(3);
    expect(loadStripe).toHaveBeenCalledTimes(3);
  });
});
