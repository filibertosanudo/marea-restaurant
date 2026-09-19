import { describe, it, expect } from "vitest";
import { folioMatches, formatFolio, isDailyFolio, isLegacyFolio, shortFolio } from "./folio-format";

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

describe("shortFolio", () => {
  it("drops the date from a daily folio, keeping the running number", () => {
    expect(shortFolio("A-260918-042")).toBe("A-042");
    expect(shortFolio("A-260918-1234")).toBe("A-1234");
  });

  it("leaves a legacy folio, or anything else, untouched", () => {
    expect(shortFolio("A-0042")).toBe("A-0042");
    expect(shortFolio("TEST-abc")).toBe("TEST-abc");
  });
});

describe("folioMatches", () => {
  const full = "A-260918-042";

  it("finds an order by the short form the kitchen shouts, or the full form on the screen", () => {
    for (const query of ["A-042", "a-042", "A042", "042", "42", " 42 ", "A-260918-042", "260918-042", "a-260918-042"]) {
      expect(folioMatches(query, full), query).toBe(true);
    }
  });

  it("does not find a different number, or the right number on another day", () => {
    expect(folioMatches("A-043", full)).toBe(false);
    expect(folioMatches("A-260919-042", full)).toBe(false);
    expect(folioMatches("A-1042", full)).toBe(false);
  });

  it("still finds a legacy order by its old folio, however it is padded", () => {
    for (const query of ["A-0042", "A-42", "0042", "42"]) {
      expect(folioMatches(query, "A-0042"), query).toBe(true);
    }
    expect(folioMatches("A-260918-042", "A-0042")).toBe(false);
  });

  it("accepts a typographic dash and ignores what is not a folio", () => {
    expect(folioMatches("A–042", full)).toBe(true);
    expect(folioMatches("", full)).toBe(false);
    expect(folioMatches("mesa 4", full)).toBe(false);
    expect(folioMatches("42", "TEST-abc")).toBe(false);
  });
});
