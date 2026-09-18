import { describe, it, expect } from "vitest";
import { formatFolio, isDailyFolio, isLegacyFolio } from "./folio-format";

describe("formatFolio", () => {
  it("puts the business's local date and a zero-padded running number in the folio", () => {
    expect(formatFolio({ year: 2026, month: 9, day: 18 }, 42)).toBe("A-260918-042");
  });

  it("zero-pads single-digit months and days", () => {
    expect(formatFolio({ year: 2026, month: 1, day: 5 }, 1)).toBe("A-260105-001");
  });

  it("keeps counting past three digits instead of truncating", () => {
    expect(formatFolio({ year: 2026, month: 9, day: 18 }, 1234)).toBe("A-260918-1234");
  });
});

describe("folio namespaces", () => {
  it("never mistakes a new folio for a legacy one, or the reverse", () => {
    const daily = formatFolio({ year: 2026, month: 9, day: 18 }, 7);
    expect(isDailyFolio(daily)).toBe(true);
    expect(isLegacyFolio(daily)).toBe(false);
    for (const legacy of ["A-0001", "A-0042", "A-9999", "A-10000"]) {
      expect(isLegacyFolio(legacy)).toBe(true);
      expect(isDailyFolio(legacy)).toBe(false);
    }
  });

  it("gives different days different folios for the same running number", () => {
    expect(formatFolio({ year: 2026, month: 9, day: 18 }, 1)).not.toBe(formatFolio({ year: 2026, month: 9, day: 19 }, 1));
    expect(formatFolio({ year: 2026, month: 9, day: 18 }, 1)).not.toBe(formatFolio({ year: 2027, month: 9, day: 18 }, 1));
  });
});
