import { describe, expect, it } from "vitest";
import { parseTimeToMinutes, formatMinutesToTime, normalizeBlock, validateWeeklySchedule } from "./schedule";

describe("parseTimeToMinutes", () => {
  it("parses a valid HH:mm", () => {
    expect(parseTimeToMinutes("18:30")).toBe(1110);
    expect(parseTimeToMinutes("00:00")).toBe(0);
    expect(parseTimeToMinutes("23:59")).toBe(1439);
  });

  it("rejects malformed input", () => {
    expect(parseTimeToMinutes("24:00")).toBeNull();
    expect(parseTimeToMinutes("9:30")).toBeNull();
    expect(parseTimeToMinutes("not-a-time")).toBeNull();
  });
});

describe("formatMinutesToTime", () => {
  it("wraps minutes past 1440 back onto a 24h clock", () => {
    expect(formatMinutesToTime(1110)).toBe("18:30");
    expect(formatMinutesToTime(1560)).toBe("02:00");
  });
});

describe("normalizeBlock", () => {
  it("keeps a same-day block as-is", () => {
    expect(normalizeBlock({ opensAt: "13:00", closesAt: "22:00" })).toEqual({ opensAt: 780, closesAt: 1320 });
  });

  it("reads a close time at or before open as past midnight", () => {
    expect(normalizeBlock({ opensAt: "20:00", closesAt: "02:00" })).toEqual({ opensAt: 1200, closesAt: 1560 });
  });

  it("rejects a zero-length block", () => {
    expect(normalizeBlock({ opensAt: "10:00", closesAt: "10:00" })).toBeNull();
  });

  it("rejects an unparseable time", () => {
    expect(normalizeBlock({ opensAt: "25:00", closesAt: "10:00" })).toBeNull();
  });
});

describe("validateWeeklySchedule", () => {
  it("passes a normal week with no overlaps", () => {
    const errors = validateWeeklySchedule([
      { dayOfWeek: 0, isOpen: true, blocks: [{ opensAt: "12:00", closesAt: "21:00" }] },
      { dayOfWeek: 1, isOpen: false, blocks: [] },
    ]);
    expect(errors).toEqual([]);
  });

  it("flags a day marked open with no blocks", () => {
    const errors = validateWeeklySchedule([{ dayOfWeek: 2, isOpen: true, blocks: [] }]);
    expect(errors).toEqual([{ dayOfWeek: 2, message: "empty_block" }]);
  });

  it("flags overlapping blocks on the same day", () => {
    const errors = validateWeeklySchedule([
      {
        dayOfWeek: 5,
        isOpen: true,
        blocks: [
          { opensAt: "13:00", closesAt: "16:00" },
          { opensAt: "15:00", closesAt: "23:00" },
        ],
      },
    ]);
    expect(errors).toEqual([{ dayOfWeek: 5, message: "overlap" }]);
  });

  it("does not flag two back-to-back non-overlapping blocks", () => {
    const errors = validateWeeklySchedule([
      {
        dayOfWeek: 5,
        isOpen: true,
        blocks: [
          { opensAt: "13:00", closesAt: "16:00" },
          { opensAt: "18:00", closesAt: "23:00" },
        ],
      },
    ]);
    expect(errors).toEqual([]);
  });

  it("does not flag an after-midnight block when the next day has no blocks", () => {
    const errors = validateWeeklySchedule([
      { dayOfWeek: 6, isOpen: true, blocks: [{ opensAt: "20:00", closesAt: "02:00" }] },
      { dayOfWeek: 0, isOpen: false, blocks: [] },
    ]);
    expect(errors).toEqual([]);
  });

  it("flags an after-midnight block that spills into the next day's own hours", () => {
    const errors = validateWeeklySchedule([
      { dayOfWeek: 6, isOpen: true, blocks: [{ opensAt: "20:00", closesAt: "02:00" }] },
      { dayOfWeek: 0, isOpen: true, blocks: [{ opensAt: "00:00", closesAt: "06:00" }] },
    ]);
    expect(errors).toEqual([{ dayOfWeek: 0, message: "overlap" }]);
  });

  it("does not flag an after-midnight block that ends before the next day opens", () => {
    const errors = validateWeeklySchedule([
      { dayOfWeek: 6, isOpen: true, blocks: [{ opensAt: "20:00", closesAt: "02:00" }] },
      { dayOfWeek: 0, isOpen: true, blocks: [{ opensAt: "12:00", closesAt: "21:00" }] },
    ]);
    expect(errors).toEqual([]);
  });
});
