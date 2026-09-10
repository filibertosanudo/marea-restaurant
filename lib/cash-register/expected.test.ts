import { describe, it, expect } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import { computeExpectedAmount, computeDifference } from "./expected";

const amount = (v: string) => new Prisma.Decimal(v);

describe("computeExpectedAmount", () => {
  it("adds the float, cash collected, and deposits, then subtracts withdrawals", () => {
    const expected = computeExpectedAmount({
      openingFloat: amount("1000.00"),
      cashCollected: amount("1950.00"),
      deposits: amount("0.00"),
      withdrawals: amount("350.00"),
    });
    expect(expected.toString()).toBe("2600");
  });

  it("is just the float with no activity", () => {
    const expected = computeExpectedAmount({
      openingFloat: amount("500.00"),
      cashCollected: amount("0.00"),
      deposits: amount("0.00"),
      withdrawals: amount("0.00"),
    });
    expect(expected.toString()).toBe("500");
  });
});

describe("computeDifference", () => {
  it("is negative when counted falls short of expected", () => {
    expect(computeDifference(amount("2550.00"), amount("2600.00")).toString()).toBe("-50");
  });

  it("is zero when counted matches expected exactly", () => {
    expect(computeDifference(amount("2600.00"), amount("2600.00")).toString()).toBe("0");
  });

  it("is positive when counted exceeds expected", () => {
    expect(computeDifference(amount("2650.00"), amount("2600.00")).toString()).toBe("50");
  });
});
