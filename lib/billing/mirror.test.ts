import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { mirrorOf } from "./mirror";
import { planForLookupKey, quantityFor } from "./plans";

function subscription(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: "sub_1",
    object: "subscription",
    status: "trialing",
    trial_end: 1_794_127_307,
    cancel_at_period_end: false,
    default_payment_method: null,
    customer: "cus_1",
    items: { data: [{ quantity: 2, current_period_end: 1_794_127_307, price: { lookup_key: "marea_cadena" } }] },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

describe("mirrorOf", () => {
  it("copies status, plan, quantity and dates from the subscription", () => {
    expect(mirrorOf(subscription())).toEqual({
      stripeSubscriptionId: "sub_1",
      status: "TRIALING",
      planLookupKey: "marea_cadena",
      quantity: 2,
      trialEndsAt: new Date(1_794_127_307_000),
      currentPeriodEndsAt: new Date(1_794_127_307_000),
      cancelAtPeriodEnd: false,
      hasPaymentMethod: false,
    });
  });

  it("maps every Stripe status", () => {
    const statuses = ["trialing", "active", "past_due", "unpaid", "paused", "canceled", "incomplete", "incomplete_expired"] as const;
    expect(statuses.map((status) => mirrorOf(subscription({ status })).status)).toEqual([
      "TRIALING",
      "ACTIVE",
      "PAST_DUE",
      "UNPAID",
      "PAUSED",
      "CANCELED",
      "INCOMPLETE",
      "INCOMPLETE_EXPIRED",
    ]);
  });

  it("sees a card on the subscription or as its customer's default", () => {
    expect(mirrorOf(subscription({ default_payment_method: "pm_1" })).hasPaymentMethod).toBe(true);
    const customer = { id: "cus_1", object: "customer", invoice_settings: { default_payment_method: "pm_2" } };
    expect(mirrorOf(subscription({ customer })).hasPaymentMethod).toBe(true);
    expect(mirrorOf(subscription({ customer: { ...customer, invoice_settings: { default_payment_method: null } } })).hasPaymentMethod).toBe(false);
  });

  it("has no trial end once there is no trial", () => {
    expect(mirrorOf(subscription({ status: "active", trial_end: null })).trialEndsAt).toBeNull();
  });
});

describe("plans", () => {
  it("finds a plan by its lookup_key and nothing else", () => {
    expect(planForLookupKey("marea_pro")).toBe("pro");
    expect(planForLookupKey("price_123")).toBeNull();
    expect(planForLookupKey(null)).toBeNull();
  });

  it("bills per branch only on the chain plan", () => {
    expect(quantityFor("cadena", 3)).toBe(3);
    expect(quantityFor("cadena", 0)).toBe(1);
    expect(quantityFor("basico", 3)).toBe(1);
  });
});
