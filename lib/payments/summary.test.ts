import { describe, it, expect } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import { sumSucceededPayments, sumSucceededRefunds, refundableForPayment, computePaymentSummary } from "./summary";

const amount = (v: string) => new Prisma.Decimal(v);

describe("sumSucceededPayments", () => {
  it("sums only SUCCEEDED payments, ignoring a failed attempt and a split retry", () => {
    const total = sumSucceededPayments([
      { status: "FAILED", amount: amount("10.00") },
      { status: "SUCCEEDED", amount: amount("15.00") },
      { status: "SUCCEEDED", amount: amount("5.00") },
    ]);
    expect(total.toString()).toBe("20");
  });
});

describe("sumSucceededRefunds", () => {
  it("sums only SUCCEEDED refunds", () => {
    const total = sumSucceededRefunds([
      { status: "PENDING", amount: amount("3.00") },
      { status: "SUCCEEDED", amount: amount("7.00") },
    ]);
    expect(total.toString()).toBe("7");
  });
});

describe("refundableForPayment", () => {
  it("is zero for a payment that never succeeded", () => {
    const payment = { status: "PENDING" as const, amount: amount("20.00"), refunds: [] };
    expect(refundableForPayment(payment).toString()).toBe("0");
  });

  it("subtracts committed (SUCCEEDED and PENDING) refunds from the payment amount", () => {
    const payment = {
      status: "SUCCEEDED" as const,
      amount: amount("20.00"),
      refunds: [
        { status: "SUCCEEDED" as const, amount: amount("5.00") },
        { status: "PENDING" as const, amount: amount("3.00") },
      ],
    };
    expect(refundableForPayment(payment).toString()).toBe("12");
  });

  it("floors at zero rather than going negative", () => {
    const payment = {
      status: "PARTIALLY_REFUNDED" as const,
      amount: amount("10.00"),
      refunds: [{ status: "SUCCEEDED" as const, amount: amount("10.00") }],
    };
    expect(refundableForPayment(payment).toString()).toBe("0");
  });
});

describe("computePaymentSummary", () => {
  it("is settled once succeeded payments minus refunds cover the order total", () => {
    const summary = computePaymentSummary(
      [{ status: "SUCCEEDED", amount: amount("23.19"), refunds: [] }],
      amount("23.19")
    );
    expect(summary.isSettled).toBe(true);
    expect(summary.paidTotal.toString()).toBe("23.19");
  });

  it("is not settled once a refund pulls the net back below the order total", () => {
    const summary = computePaymentSummary(
      [{ status: "SUCCEEDED", amount: amount("23.19"), refunds: [{ status: "SUCCEEDED", amount: amount("23.19") }] }],
      amount("23.19")
    );
    expect(summary.isSettled).toBe(false);
    expect(summary.refundedTotal.toString()).toBe("23.19");
  });

  it("a split cash+card order is settled by the sum, not either payment alone", () => {
    const summary = computePaymentSummary(
      [
        { status: "SUCCEEDED", amount: amount("10.00"), refunds: [] },
        { status: "SUCCEEDED", amount: amount("13.19"), refunds: [] },
      ],
      amount("23.19")
    );
    expect(summary.isSettled).toBe(true);
  });
});
