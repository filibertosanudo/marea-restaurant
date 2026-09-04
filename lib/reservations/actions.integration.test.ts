import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { createReservationAction, getReservationSlotsAction, cancelReservationByCodeAction } from "./actions";
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

describe("getReservationSlotsAction", () => {
  it("rejects a malformed date instead of throwing", async () => {
    await makeAlwaysOpenBusiness();

    const result = await getReservationSlotsAction("not-a-date", 2);

    expect(result).toEqual({ ok: false, error: "invalid_input" });
  });
});

describe("cancelReservationByCodeAction", () => {
  it("cancels a reservation with enough lead time", async () => {
    const business = await makeAlwaysOpenBusiness();
    const table = await prisma.restaurantTable.findFirstOrThrow({ where: { businessId: business.id } });
    const reservedFor = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const reservation = await prisma.reservation.create({
      data: {
        businessId: business.id,
        tableId: table.id,
        guestName: "Ana",
        partySize: 2,
        reservedFor,
        endsAt: new Date(reservedFor.getTime() + 60 * 60 * 1000),
        status: "PENDING",
      },
    });

    const result = await cancelReservationByCodeAction(reservation.confirmationCode);

    expect(result).toEqual({ ok: true });
    const updated = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
    expect(updated.status).toBe("CANCELLED");
  });

  it("reports not_found for an unknown code, not a distinguishable error", async () => {
    await makeAlwaysOpenBusiness();

    const result = await cancelReservationByCodeAction("does-not-exist");

    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it("refuses to cancel once inside the minimum cancel lead time", async () => {
    const business = await makeBusiness({
      slug: "marea",
      timezone: "UTC",
      minCancelLeadMinutes: 1440,
    });
    const table = await prisma.restaurantTable.create({ data: { businessId: business.id, code: "T1", seats: 2 } });
    const reservedFor = new Date(Date.now() + 60 * 60 * 1000);
    const reservation = await prisma.reservation.create({
      data: {
        businessId: business.id,
        tableId: table.id,
        guestName: "Ana",
        partySize: 2,
        reservedFor,
        endsAt: new Date(reservedFor.getTime() + 60 * 60 * 1000),
        status: "PENDING",
      },
    });

    const result = await cancelReservationByCodeAction(reservation.confirmationCode);

    expect(result).toEqual({ ok: false, error: "too_late" });
  });
});
