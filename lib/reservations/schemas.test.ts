import { describe, expect, it } from "vitest";
import { reservationSlotsQuerySchema, isWithinBookingHorizon, MAX_BOOKING_HORIZON_DAYS } from "./schemas";

function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

describe("reservationSlotsQuerySchema", () => {
  it("accepts a well-formed date", () => {
    const result = reservationSlotsQuerySchema.safeParse({ date: isoDaysFromNow(30), partySize: 2 });
    expect(result.success).toBe(true);
  });

  // The horizon is no longer this schema's job (see isWithinBookingHorizon
  // below) — it needs a business timezone the schema is never given, so a
  // date past MAX_BOOKING_HORIZON_DAYS is still structurally well-formed
  // here and must pass.
  it("accepts a date past the booking horizon — that's isWithinBookingHorizon's job now", () => {
    const result = reservationSlotsQuerySchema.safeParse({
      date: isoDaysFromNow(MAX_BOOKING_HORIZON_DAYS + 5),
      partySize: 2,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a calendar date that doesn't exist", () => {
    const result = reservationSlotsQuerySchema.safeParse({ date: "2026-02-30", partySize: 2 });
    expect(result.success).toBe(false);
  });
});

describe("isWithinBookingHorizon", () => {
  // America/Hermosillo is UTC-7 year-round — chosen so a `now` right after
  // UTC midnight is still "yesterday" in the business's own timezone,
  // exactly the gap a raw-UTC comparison would get wrong.
  const TIMEZONE = "America/Hermosillo";

  it("accepts today itself", () => {
    const now = new Date("2026-03-01T12:00:00Z"); // 2026-03-01 05:00 local
    expect(isWithinBookingHorizon({ year: 2026, month: 3, day: 1 }, now, TIMEZONE)).toBe(true);
  });

  it("accepts exactly MAX_BOOKING_HORIZON_DAYS out", () => {
    const now = new Date("2026-03-01T12:00:00Z");
    expect(isWithinBookingHorizon({ year: 2026, month: 5, day: 30 }, now, TIMEZONE)).toBe(true); // +90 days
  });

  it("rejects one day past the horizon", () => {
    const now = new Date("2026-03-01T12:00:00Z");
    expect(isWithinBookingHorizon({ year: 2026, month: 5, day: 31 }, now, TIMEZONE)).toBe(false); // +91 days
  });

  it("resolves 'today' in the business's timezone, not raw UTC", () => {
    // 00:30 UTC on March 2 is still 17:30 local on March 1 in Hermosillo —
    // a UTC-midnight comparison would treat "today" as March 2 and reject
    // a request for March 1 + 90 days one day early.
    const now = new Date("2026-03-02T00:30:00Z");
    expect(isWithinBookingHorizon({ year: 2026, month: 5, day: 30 }, now, TIMEZONE)).toBe(true);
  });
});
