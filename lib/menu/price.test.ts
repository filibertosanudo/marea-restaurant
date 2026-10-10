import { describe, expect, it } from "vitest";
import { parsePrice } from "./price";

describe("parsePrice", () => {
  it.each([
    ["145", "145"],
    ["145.00", "145.00"],
    ["$145.00", "145.00"],
    ["$1,250.00", "1250.00"],
    ["1.250,50", "1250.50"],
    ["1,250", "1250"],
    ["1.250", "1250"],
    ["12,5", "12.5"],
    ["99.9", "99.9"],
    ["MXN 1 250", "1250"],
    ["1,250,000.50", "1250000.50"],
  ])("reads %s as %s", (raw, expected) => {
    expect(parsePrice(raw)).toBe(expected);
  });

  it.each(["", "gratis", "-5", "12.345,", "1.2.3,4,5x", "$", "1,2,3"])("refuses %j", (raw) => {
    expect(parsePrice(raw)).toBeNull();
  });
});
