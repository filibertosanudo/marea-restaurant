import { describe, it, expect } from "vitest";
import { canTransitionPayment, assertPaymentTransition, IllegalPaymentTransitionError, CANCELLABLE_PAYMENT_STATUSES } from "./state-machine";

describe("canTransitionPayment", () => {
  it("allows PENDING to move on to any of its legal next states", () => {
    expect(canTransitionPayment("PENDING", "PROCESSING")).toBe(true);
    expect(canTransitionPayment("PENDING", "SUCCEEDED")).toBe(true);
  });

  it("allows FAILED to retry into SUCCEEDED — a declined card doesn't kill the intent", () => {
    expect(canTransitionPayment("FAILED", "SUCCEEDED")).toBe(true);
  });

  it("refuses any transition out of a terminal state", () => {
    expect(canTransitionPayment("CANCELLED", "SUCCEEDED")).toBe(false);
    expect(canTransitionPayment("REFUNDED", "SUCCEEDED")).toBe(false);
  });

  it("allows a partial refund to become a full one, never the reverse", () => {
    expect(canTransitionPayment("PARTIALLY_REFUNDED", "REFUNDED")).toBe(true);
    expect(canTransitionPayment("REFUNDED", "PARTIALLY_REFUNDED")).toBe(false);
  });
});

describe("assertPaymentTransition", () => {
  it("throws IllegalPaymentTransitionError for a rejected transition", () => {
    expect(() => assertPaymentTransition("REFUNDED", "SUCCEEDED")).toThrow(IllegalPaymentTransitionError);
  });

  it("does not throw for a legal transition", () => {
    expect(() => assertPaymentTransition("PENDING", "SUCCEEDED")).not.toThrow();
  });
});

describe("CANCELLABLE_PAYMENT_STATUSES", () => {
  it("is derived from the graph, not hand-listed — includes every pre-settlement state", () => {
    expect(CANCELLABLE_PAYMENT_STATUSES).toEqual(
      expect.arrayContaining(["PENDING", "PROCESSING", "REQUIRES_ACTION", "FAILED"])
    );
  });

  it("never includes a terminal or already-settled state", () => {
    expect(CANCELLABLE_PAYMENT_STATUSES).not.toEqual(expect.arrayContaining(["SUCCEEDED", "REFUNDED", "CANCELLED"]));
  });
});
