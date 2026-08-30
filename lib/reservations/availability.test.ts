import { describe, expect, it } from "vitest";
import { getAvailableSlots, findSlot, type AvailabilityInput } from "./availability";

// America/Hermosillo is UTC-7 year-round (Sonora doesn't observe DST) — a
// deterministic zone to assert exact UTC instants against, matching
// Business.timezone's own default in schema.prisma.
const TIMEZONE = "America/Hermosillo";
const BUSINESS_DAY = { year: 2026, month: 2, day: 27 }; // a Friday
const NOW = new Date("2026-02-01T00:00:00Z");

function baseInput(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    date: BUSINESS_DAY,
    partySize: 2,
    durationMinutes: 90,
    maxPartySize: 12,
    timezone: TIMEZONE,
    openingHours: [{ dayOfWeek: 5, opensAt: 720, closesAt: 1380, isClosed: false }], // Fri 12:00–23:00
    closures: [],
    tables: [
      { id: "t-small", seats: 2 },
      { id: "t-medium", seats: 4 },
      { id: "t-large", seats: 8 },
    ],
    existingReservations: [],
    now: NOW,
    ...overrides,
  };
}

describe("getAvailableSlots", () => {
  it("offers a slot inside the opening window with a free table", () => {
    const slots = getAvailableSlots(baseInput());
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0]).toMatchObject({ minutesFromMidnight: 720, tableId: "t-small" }); // 12:00
  });

  it("resolves the local wall-clock time to the correct UTC instant", () => {
    const slots = getAvailableSlots(baseInput());
    const noon = slots.find((s) => s.minutesFromMidnight === 720)!; // 12:00
    // 12:00 in UTC-7 is 19:00 UTC.
    expect(noon.startsAt.toISOString()).toBe("2026-02-27T19:00:00.000Z");
  });

  it("rejects a party larger than the business's maxPartySize", () => {
    const slots = getAvailableSlots(baseInput({ partySize: 20, maxPartySize: 12 }));
    expect(slots).toEqual([]);
  });

  it("rejects a party size below one", () => {
    const slots = getAvailableSlots(baseInput({ partySize: 0 }));
    expect(slots).toEqual([]);
  });

  it("offers nothing on a day with no matching opening-hour window", () => {
    const slots = getAvailableSlots(
      baseInput({ openingHours: [{ dayOfWeek: 1, opensAt: 720, closesAt: 1380, isClosed: false }] })
    );
    expect(slots).toEqual([]);
  });

  it("offers nothing when the matching window is marked closed", () => {
    const slots = getAvailableSlots(
      baseInput({ openingHours: [{ dayOfWeek: 5, opensAt: 720, closesAt: 1380, isClosed: true }] })
    );
    expect(slots).toEqual([]);
  });

  it("never offers a slot that would seat the party past closing", () => {
    const slots = getAvailableSlots(baseInput({ durationMinutes: 90 }));
    const lastStart = Math.max(...slots.map((s) => s.minutesFromMidnight));
    // Window closes at minute 1380 (23:00); a 90-minute reservation can
    // start no later than minute 1290 (21:30).
    expect(lastStart).toBeLessThanOrEqual(1290);
  });

  it("excludes a slot that falls inside a BusinessClosure", () => {
    const slots = getAvailableSlots(
      baseInput({
        closures: [
          {
            startsAt: new Date("2026-02-27T19:00:00Z"), // 12:00 local
            endsAt: new Date("2026-02-27T21:00:00Z"), // 14:00 local
          },
        ],
      })
    );
    expect(slots.find((s) => s.minutesFromMidnight === 720)).toBeUndefined(); // 12:00
    expect(slots.find((s) => s.minutesFromMidnight === 870)).toBeDefined(); // 14:30
  });

  it("excludes a slot that starts at or before `now`", () => {
    const slots = getAvailableSlots(
      baseInput({ now: new Date("2026-02-27T20:00:00Z") }) // 13:00 local
    );
    expect(slots.find((s) => s.minutesFromMidnight === 720)).toBeUndefined(); // 12:00
    expect(slots.find((s) => s.minutesFromMidnight === 750)).toBeUndefined(); // 12:30
    expect(slots.find((s) => s.minutesFromMidnight === 810)).toBeDefined(); // 13:30
  });

  it("excludes a slot that's in the future but inside minLeadMinutes", () => {
    // now = 11:50 local; a 30-minute lead means nothing before 12:20 qualifies.
    const slots = getAvailableSlots(baseInput({ now: new Date("2026-02-27T18:50:00Z"), minLeadMinutes: 30 }));
    expect(slots.find((s) => s.minutesFromMidnight === 720)).toBeUndefined(); // 12:00
    expect(slots.find((s) => s.minutesFromMidnight === 750)).toBeDefined(); // 12:30
  });

  it("defaults minLeadMinutes to 0 — only bare future matters when omitted", () => {
    const slots = getAvailableSlots(baseInput({ now: new Date("2026-02-27T18:59:00Z") })); // 11:59 local
    expect(slots.find((s) => s.minutesFromMidnight === 720)).toBeDefined(); // 12:00
  });

  it("picks the smallest table that fits, leaving larger tables free", () => {
    const slots = getAvailableSlots(baseInput({ partySize: 2 }));
    expect(slots.every((s) => s.tableId === "t-small")).toBe(true);
  });

  it("falls back to a larger table once every smaller one is taken", () => {
    const slots = getAvailableSlots(
      baseInput({
        partySize: 2,
        existingReservations: [
          {
            tableId: "t-small",
            reservedFor: new Date("2026-02-27T19:00:00Z"),
            endsAt: new Date("2026-02-27T20:30:00Z"),
            status: "CONFIRMED",
          },
        ],
      })
    );
    const noon = slots.find((s) => s.minutesFromMidnight === 720)!; // 12:00
    expect(noon.tableId).toBe("t-medium");
  });

  it("blocks a table for PENDING, CONFIRMED, and SEATED, but not CANCELLED/NO_SHOW/COMPLETED", () => {
    const overlapping = (status: AvailabilityInput["existingReservations"][number]["status"]) =>
      getAvailableSlots(
        baseInput({
          tables: [{ id: "only-table", seats: 2 }],
          existingReservations: [
            {
              tableId: "only-table",
              reservedFor: new Date("2026-02-27T19:00:00Z"),
              endsAt: new Date("2026-02-27T20:30:00Z"),
              status,
            },
          ],
        })
      ).some((s) => s.minutesFromMidnight === 720); // 12:00

    expect(overlapping("PENDING")).toBe(false);
    expect(overlapping("CONFIRMED")).toBe(false);
    expect(overlapping("SEATED")).toBe(false);
    expect(overlapping("CANCELLED")).toBe(true);
    expect(overlapping("NO_SHOW")).toBe(true);
    expect(overlapping("COMPLETED")).toBe(true);
  });

  it("does not block a table against a reservation that only touches its edge", () => {
    // An existing reservation ending exactly when the candidate starts (or
    // starting exactly when the candidate ends) must not count as overlap —
    // back-to-back seatings are the whole point of a duration column.
    const slots = getAvailableSlots(
      baseInput({
        tables: [{ id: "only-table", seats: 2 }],
        existingReservations: [
          {
            tableId: "only-table",
            reservedFor: new Date("2026-02-27T17:30:00Z"), // 10:30 local
            endsAt: new Date("2026-02-27T19:00:00Z"), // 12:00 local — ends exactly at noon
            status: "CONFIRMED",
          },
        ],
      })
    );
    expect(slots.find((s) => s.minutesFromMidnight === 720)).toBeDefined(); // 12:00
  });

  it("rolls a close-after-midnight window into the next calendar day", () => {
    // Friday 20:00 to 02:00 Saturday (1200 minutes past midnight).
    const slots = getAvailableSlots(
      baseInput({
        openingHours: [{ dayOfWeek: 5, opensAt: 1200, closesAt: 1560, isClosed: false }],
        durationMinutes: 60,
      })
    );
    const lateSlot = slots.find((s) => s.minutesFromMidnight === 1500); // 01:00 the next calendar day
    expect(lateSlot).toBeDefined();
    // 01:00 the night of Feb 27 (Fri) rolls into Feb 28 local, i.e. 08:00 UTC Feb 28.
    expect(lateSlot!.startsAt.toISOString()).toBe("2026-02-28T08:00:00.000Z");
  });

  it("never collapses a same-day slot and a next-day slot into the same identity", () => {
    // Two windows the same Friday: an early-morning one (00:00-01:00, from
    // Thursday night's close) and a late one that runs past midnight
    // (20:00-02:00 Saturday). Minute 30 (00:30 today) and minute 1470
    // (00:30 the *next* calendar day) both exist — the exact collision
    // minutesToHHMM used to produce by reducing both to the string "00:30".
    const slots = getAvailableSlots(
      baseInput({
        openingHours: [
          { dayOfWeek: 5, opensAt: 0, closesAt: 60, isClosed: false },
          { dayOfWeek: 5, opensAt: 1200, closesAt: 1560, isClosed: false },
        ],
        durationMinutes: 30,
        now: new Date("2026-02-26T00:00:00Z"),
      })
    );

    const sameDay = slots.find((s) => s.minutesFromMidnight === 30);
    const nextDay = slots.find((s) => s.minutesFromMidnight === 1470);
    expect(sameDay).toBeDefined();
    expect(nextDay).toBeDefined();
    expect(sameDay!.startsAt.getTime()).not.toBe(nextDay!.startsAt.getTime());
    // 00:30 today (Feb 27, UTC-7) is 07:30 UTC the same date.
    expect(sameDay!.startsAt.toISOString()).toBe("2026-02-27T07:30:00.000Z");
    // 00:30 the *next* day (Feb 28, UTC-7) is 07:30 UTC Feb 28.
    expect(nextDay!.startsAt.toISOString()).toBe("2026-02-28T07:30:00.000Z");

    // findSlot must resolve each minute value to its own distinct instant,
    // not "the first slot with a matching label".
    expect(findSlot(baseInput({
      openingHours: [
        { dayOfWeek: 5, opensAt: 0, closesAt: 60, isClosed: false },
        { dayOfWeek: 5, opensAt: 1200, closesAt: 1560, isClosed: false },
      ],
      durationMinutes: 30,
      now: new Date("2026-02-26T00:00:00Z"),
    }), 30)!.startsAt.toISOString()).toBe("2026-02-27T07:30:00.000Z");
  });
});

describe("findSlot", () => {
  it("returns the matching slot when it's still available", () => {
    const slot = findSlot(baseInput(), 720); // 12:00
    expect(slot?.tableId).toBe("t-small");
  });

  it("returns null once the slot has been taken since it was last listed", () => {
    const input = baseInput({
      tables: [{ id: "only-table", seats: 2 }],
      existingReservations: [
        {
          tableId: "only-table",
          reservedFor: new Date("2026-02-27T19:00:00Z"),
          endsAt: new Date("2026-02-27T20:30:00Z"),
          status: "CONFIRMED",
        },
      ],
    });
    expect(findSlot(input, 720)).toBeNull(); // 12:00
  });
});
