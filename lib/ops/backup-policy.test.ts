import { describe, expect, it } from "vitest";
import { BACKUP_TIERS, TIER_RETENTION_DAYS, backupSlot, tiersForSlot } from "./backup-policy";

describe("backupSlot", () => {
  it("rounds the hour down to a multiple of six, in UTC", () => {
    expect(backupSlot(new Date("2026-09-26T00:00:00Z"))).toBe("2026-09-26T00");
    expect(backupSlot(new Date("2026-09-26T05:59:59Z"))).toBe("2026-09-26T00");
    expect(backupSlot(new Date("2026-09-26T06:00:00Z"))).toBe("2026-09-26T06");
    expect(backupSlot(new Date("2026-09-26T23:59:59Z"))).toBe("2026-09-26T18");
  });

  it("gives every moment of one window the same slot, which is what makes a rerun a no-op", () => {
    expect(backupSlot(new Date("2026-09-26T12:01:00Z"))).toBe(backupSlot(new Date("2026-09-26T17:59:00Z")));
  });
});

describe("tiersForSlot", () => {
  it("makes only a six-hourly copy outside the first window of a day", () => {
    expect(tiersForSlot("2026-11-03T06")).toEqual(["sixhourly"]);
    expect(tiersForSlot("2026-11-01T18")).toEqual(["sixhourly"]);
  });

  it("adds the daily copy in the first window of a day", () => {
    expect(tiersForSlot("2026-11-03T00")).toEqual(["sixhourly", "daily"]);
  });

  it("adds the weekly copy on a Sunday", () => {
    expect(tiersForSlot("2026-11-08T00")).toEqual(["sixhourly", "daily", "weekly"]);
  });

  it("adds the monthly copy on the first of a month, and all four when it is a Sunday", () => {
    expect(tiersForSlot("2026-10-01T00")).toEqual(["sixhourly", "daily", "monthly"]);
    expect(tiersForSlot("2026-11-01T00")).toEqual(["sixhourly", "daily", "weekly", "monthly"]);
  });
});

describe("TIER_RETENTION_DAYS", () => {
  it("covers every tier", () => {
    for (const tier of BACKUP_TIERS) expect(TIER_RETENTION_DAYS[tier]).toBeGreaterThan(0);
  });

  it("keeps the longest copy within the 90 days the privacy notice promises", () => {
    expect(Math.max(...Object.values(TIER_RETENTION_DAYS))).toBeLessThanOrEqual(90);
  });
});
