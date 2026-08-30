import { describe, expect, it } from "vitest";
import { reservationSlotsQuerySchema, MAX_BOOKING_HORIZON_DAYS } from "./schemas";

function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

describe("reservationSlotsQuerySchema", () => {
  it("accepts a date within the booking horizon", () => {
    const result = reservationSlotsQuerySchema.safeParse({ date: isoDaysFromNow(30), partySize: 2 });
    expect(result.success).toBe(true);
  });

  it("rejects a date past the booking horizon", () => {
    const result = reservationSlotsQuerySchema.safeParse({
      date: isoDaysFromNow(MAX_BOOKING_HORIZON_DAYS + 5),
      partySize: 2,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a calendar date that doesn't exist", () => {
    const result = reservationSlotsQuerySchema.safeParse({ date: "2026-02-30", partySize: 2 });
    expect(result.success).toBe(false);
  });
});
