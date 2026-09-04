import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { createReservationAction, getReservationSlotsAction } from "./actions";
import { makeBusiness } from "@/test/factories";
import { runConcurrently, partitionSettled } from "@/test/concurrency";

const guest = { guestName: "Ana Ruiz", guestEmail: "ana@example.com" };

/** A business open every hour of every day, with a single two-seat table — removes opening-hours/lead-time edge cases from a test that's about the EXCLUDE constraint, not availability.ts (already covered by its own unit tests). */
async function makeAlwaysOpenBusiness() {
  const business = await makeBusiness({
    slug: "marea",
    timezone: "UTC",
    minBookingLeadMinutes: 0,
    defaultReservationMinutes: 60,
  });
  await prisma.openingHour.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      businessId: business.id,
      dayOfWeek,
      opensAt: 0,
      closesAt: 1440,
    })),
  });
  await prisma.restaurantTable.create({
    data: { businessId: business.id, code: "T1", seats: 2 },
  });
  return business;
}

function tomorrowDateString(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

describe("createReservationAction", () => {
  it("two concurrent bookings on the same slot: one is created, the other collides with the EXCLUDE constraint", async () => {
    const business = await makeAlwaysOpenBusiness();
    const date = tomorrowDateString();

    const slots = await getReservationSlotsAction(date, 2);
    if (!slots.ok) throw new Error("test setup: no slots came back");
    const time = slots.slots[0];

    const results = await runConcurrently([
      () => createReservationAction({ ...guest, partySize: 2, date, time }),
      () => createReservationAction({ ...guest, partySize: 2, date, time }),
    ]);
    const { fulfilled } = partitionSettled(results);

    // Both calls resolve (createReservationAction never throws for a taken
    // slot, it returns { ok: false }), so this is really two disjoint
    // groups of one result each.
    expect(fulfilled).toHaveLength(2);
    const succeeded = fulfilled.filter((r) => r.ok);
    const collided = fulfilled.filter((r) => !r.ok);
    expect(succeeded).toHaveLength(1);
    expect(collided).toHaveLength(1);
    expect(collided[0]).toMatchObject({ ok: false, error: "slot_taken" });

    // Both calls read availability from the same pre-insert snapshot (they
    // started before either had a chance to commit) and only the database's
    // own EXCLUDE constraint — not the application-level pre-check findSlot
    // runs first — is what could have rejected the second one.
    const reservationCount = await prisma.reservation.count({ where: { businessId: business.id } });
    expect(reservationCount).toBe(1);
  });
});
