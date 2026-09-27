import { describe, expect, it } from "vitest";
import { slotFor } from "./scheduled-task";

describe("slotFor", () => {
  it("truncates to the hour, day or month, in UTC", () => {
    const now = new Date("2026-11-03T05:42:17Z");
    expect(slotFor("hourly", now)).toBe("2026-11-03T05");
    expect(slotFor("daily", now)).toBe("2026-11-03");
    expect(slotFor("monthly", now)).toBe("2026-11");
  });

  it("gives every moment of a window the same slot, which is what makes a rerun a no-op", () => {
    expect(slotFor("daily", new Date("2026-11-03T00:00:01Z"))).toBe(slotFor("daily", new Date("2026-11-03T23:59:59Z")));
  });
});
