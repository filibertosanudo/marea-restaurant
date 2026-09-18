import { describe, it, expect } from "vitest";
import { formatWeeklyHours } from "./opening-hours-format";
import type { OpeningHourWindow } from "@/lib/reservations/availability";

function hour(dayOfWeek: number, opensAt: number, closesAt: number): OpeningHourWindow {
  return { dayOfWeek, opensAt, closesAt, isClosed: false };
}

describe("formatWeeklyHours", () => {
  it("returns null when there are no rows at all", () => {
    const result = formatWeeklyHours([], "en");
    expect(result).toBeNull();
  });

  it("returns null when every day is explicitly marked closed", () => {
    const hours: OpeningHourWindow[] = Array.from({ length: 7 }, (_, d) => ({
      dayOfWeek: d,
      opensAt: 0,
      closesAt: 0,
      isClosed: true,
    }));

    const result = formatWeeklyHours(hours, "en");

    expect(result).toBeNull();
  });

  it("compresses consecutive days with the same hours and omits the closed day", () => {
    // Tue(2)-Sun(0) open 12pm-11pm, Monday(1) closed (no row at all).
    const hours: OpeningHourWindow[] = [0, 2, 3, 4, 5, 6].map((d) => hour(d, 720, 1380));

    const result = formatWeeklyHours(hours, "en");

    expect(result).toBe("Tue–Sun · 12pm – 11pm");
  });

  it("matches the schema's own Spanish example", () => {
    const hours: OpeningHourWindow[] = [0, 2, 3, 4, 5, 6].map((d) => hour(d, 720, 1380));

    const result = formatWeeklyHours(hours, "es");

    expect(result).toBe("Mar–Dom · 12pm – 11pm");
  });

  it("joins two blocks on the same day with a comma", () => {
    const hours: OpeningHourWindow[] = [1, 2, 3, 4, 5].flatMap((d) => [
      hour(d, 720, 900), // 12pm-3pm
      hour(d, 1080, 1380), // 6pm-11pm
    ]);

    const result = formatWeeklyHours(hours, "en");

    expect(result).toBe("Mon–Fri · 12pm – 3pm, 6pm – 11pm");
  });

  it("wraps a close time past midnight onto the 12-hour clock", () => {
    const hours: OpeningHourWindow[] = [5, 6].map((d) => hour(d, 1200, 1500)); // 8pm - 1am

    const result = formatWeeklyHours(hours, "en");

    expect(result).toBe("Fri–Sat · 8pm – 1am");
  });

  it("formats a single open day with no range dash", () => {
    const hours: OpeningHourWindow[] = [hour(0, 660, 900)];

    const result = formatWeeklyHours(hours, "en");

    expect(result).toBe("Sun · 11am – 3pm");
  });

  it("groups a weekend that wraps around the array boundary", () => {
    // Mon-Fri one schedule, Sat/Sun another — Saturday is index 6 and
    // Sunday is index 0, so this only reads as one group with rotation.
    const weekday = [1, 2, 3, 4, 5].map((d) => hour(d, 660, 1260)); // 11am-9pm
    const weekend = [6, 0].map((d) => hour(d, 600, 1320)); // 10am-10pm

    const result = formatWeeklyHours([...weekday, ...weekend], "en");

    expect(result).toBe("Mon–Fri · 11am – 9pm; Sat–Sun · 10am – 10pm");
  });

  it("treats an isClosed row the same as a missing row", () => {
    const hours: OpeningHourWindow[] = [
      ...[2, 3, 4, 5, 6, 0].map((d) => hour(d, 720, 1380)),
      { dayOfWeek: 1, opensAt: 0, closesAt: 0, isClosed: true },
    ];

    const result = formatWeeklyHours(hours, "en");

    expect(result).toBe("Tue–Sun · 12pm – 11pm");
  });

  it("returns a single range when every day has identical hours", () => {
    const hours: OpeningHourWindow[] = Array.from({ length: 7 }, (_, d) => hour(d, 660, 1320));

    const result = formatWeeklyHours(hours, "en");

    expect(result).toBe("Sun–Sat · 11am – 10pm");
  });
});
