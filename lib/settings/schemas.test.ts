import { describe, it, expect } from "vitest";
import { closureSchema, businessSettingsSchema } from "./schemas";

const validSettings = {
  defaultLocale: "en" as const,
  currency: "MXN" as const,
  timezone: "America/Hermosillo" as const,
  defaultReservationMinutes: "90",
  maxPartySize: "12",
  acceptsOnlinePayment: true,
  minBookingLeadMinutes: "30",
  minCancelLeadMinutes: "120",
};

describe("closureSchema", () => {
  it("accepts an all-day closure with no times", () => {
    expect(closureSchema.safeParse({ date: "2026-12-25", allDay: true }).success).toBe(true);
  });

  it("requires start/end times when it isn't all day", () => {
    expect(closureSchema.safeParse({ date: "2026-12-25", allDay: false }).success).toBe(false);
  });

  it("accepts a partial-day closure with both times given", () => {
    const result = closureSchema.safeParse({
      date: "2026-12-25",
      allDay: false,
      startTime: "18:00",
      endTime: "22:00",
    });
    expect(result.success).toBe(true);
  });
});

describe("businessSettingsSchema", () => {
  it("accepts a well-formed settings payload", () => {
    expect(businessSettingsSchema.safeParse(validSettings).success).toBe(true);
  });

  it("rejects a booking lead time longer than the cancel lead time", () => {
    const result = businessSettingsSchema.safeParse({
      ...validSettings,
      minBookingLeadMinutes: "200",
      minCancelLeadMinutes: "120",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing minutes field rather than silently coercing it to 0", () => {
    const rest: Partial<typeof validSettings> = { ...validSettings };
    delete rest.minBookingLeadMinutes;
    expect(businessSettingsSchema.safeParse(rest).success).toBe(false);
  });
});
