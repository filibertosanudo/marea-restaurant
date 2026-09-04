import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  confirmReservationAction,
  reassignReservationTableAction,
  seatReservationAction,
  completeReservationAction,
  markNoShowAction,
  cancelReservationAction,
} from "./staff-actions";
import { makeBusiness, makeStaff } from "@/test/factories";
import { setTestSession, sessionUserFromRow } from "@/test/stubs/auth-session";
import { runConcurrently, partitionSettled } from "@/test/concurrency";

async function loginAs(role: "STAFF" | "BUSINESS_ADMIN") {
  const user = await makeStaff(role);
  setTestSession(sessionUserFromRow(user));
}

async function makeTable(businessId: string, seats = 2) {
  return prisma.restaurantTable.create({ data: { businessId, code: `T-${Math.random().toString(36).slice(2, 6)}`, seats } });
}

async function makeReservation(businessId: string, tableId: string, overrides: Record<string, unknown> = {}) {
  const reservedFor = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return prisma.reservation.create({
    data: {
      businessId,
      tableId,
      guestName: "Ana Ruiz",
      partySize: 2,
      reservedFor,
      endsAt: new Date(reservedFor.getTime() + 90 * 60 * 1000),
      status: "PENDING",
      ...overrides,
    },
  });
}

describe("confirmReservationAction", () => {
  it("reports not_found for an unknown reservation", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");
    await makeTable(business.id);

    const result = await confirmReservationAction("does-not-exist");

    expect(result).toEqual({ error: "not_found" });
  });

  it("rejects a caller outside STAFF_ROLES", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const user = await makeStaff("CUSTOMER");
    setTestSession(sessionUserFromRow(user));
    const table = await makeTable(business.id);
    const reservation = await makeReservation(business.id, table.id);

    const result = await confirmReservationAction(reservation.id);

    expect(result).toEqual({ error: "forbidden" });
  });

  it("refuses to reassign onto a table that doesn't exist", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");
    const table = await makeTable(business.id);
    const reservation = await makeReservation(business.id, table.id);

    const result = await confirmReservationAction(reservation.id, "does-not-exist");

    expect(result).toEqual({ error: "table_not_found" });
  });

  it("refuses to reassign onto a table too small for the party while confirming", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");
    const table = await makeTable(business.id);
    const smallTable = await makeTable(business.id, 1);
    const reservation = await makeReservation(business.id, table.id, { partySize: 2 });

    const result = await confirmReservationAction(reservation.id, smallTable.id);

    expect(result).toEqual({ error: "table_too_small" });
  });

  it("refuses to reassign onto a table already overlapping another blocking reservation", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");
    const tableA = await makeTable(business.id);
    const tableB = await makeTable(business.id);
    const reservedFor = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await makeReservation(business.id, tableA.id, { reservedFor, status: "CONFIRMED" });
    const reservation = await makeReservation(business.id, tableB.id, { reservedFor });

    const result = await confirmReservationAction(reservation.id, tableA.id);

    expect(result).toEqual({ error: "table_taken" });
  });

  it("confirms a pending reservation", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");
    const table = await makeTable(business.id);
    const reservation = await makeReservation(business.id, table.id);

    const result = await confirmReservationAction(reservation.id);

    expect(result).toBeUndefined();
    const updated = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
    expect(updated.status).toBe("CONFIRMED");
  });

  it("rejects confirming a reservation that's already past PENDING/CONFIRMED", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");
    const table = await makeTable(business.id);
    const reservation = await makeReservation(business.id, table.id, { status: "COMPLETED" });

    const result = await confirmReservationAction(reservation.id);

    expect(result).toEqual({ error: "invalid_transition" });
  });

  it("reassigns to a different table while confirming, when asked to", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");
    const originalTable = await makeTable(business.id);
    const newTable = await makeTable(business.id);
    const reservation = await makeReservation(business.id, originalTable.id);

    await confirmReservationAction(reservation.id, newTable.id);

    const updated = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
    expect(updated.tableId).toBe(newTable.id);
  });
});

describe("reassignReservationTableAction", () => {
  it("reports not_found for an unknown reservation", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");
    const table = await makeTable(business.id);

    const result = await reassignReservationTableAction("does-not-exist", table.id);

    expect(result).toEqual({ error: "not_found" });
  });

  it("rejects a caller outside STAFF_ROLES", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const user = await makeStaff("CUSTOMER");
    setTestSession(sessionUserFromRow(user));
    const table = await makeTable(business.id);
    const newTable = await makeTable(business.id);
    const reservation = await makeReservation(business.id, table.id, { status: "CONFIRMED" });

    const result = await reassignReservationTableAction(reservation.id, newTable.id);

    expect(result).toEqual({ error: "forbidden" });
  });

  it("refuses to reassign a reservation that isn't holding a table anymore", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");
    const originalTable = await makeTable(business.id);
    const newTable = await makeTable(business.id);
    const reservation = await makeReservation(business.id, originalTable.id, { status: "CANCELLED" });

    const result = await reassignReservationTableAction(reservation.id, newTable.id);

    expect(result).toEqual({ error: "invalid_transition" });
  });

  it("no-ops when asked to reassign onto the table it's already on", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");
    const table = await makeTable(business.id);
    const reservation = await makeReservation(business.id, table.id, { status: "CONFIRMED" });

    const result = await reassignReservationTableAction(reservation.id, table.id);

    expect(result).toBeUndefined();
  });

  it("refuses to reassign onto a table that doesn't exist", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");
    const table = await makeTable(business.id);
    const reservation = await makeReservation(business.id, table.id, { status: "CONFIRMED" });

    const result = await reassignReservationTableAction(reservation.id, "does-not-exist");

    expect(result).toEqual({ error: "table_not_found" });
  });

  it("refuses to reassign onto a table already overlapping another blocking reservation", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");
    const tableA = await makeTable(business.id);
    const tableB = await makeTable(business.id);
    const reservedFor = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await makeReservation(business.id, tableA.id, { reservedFor, status: "CONFIRMED" });
    const reservation = await makeReservation(business.id, tableB.id, { reservedFor, status: "CONFIRMED" });

    const result = await reassignReservationTableAction(reservation.id, tableA.id);

    expect(result).toEqual({ error: "table_taken" });
  });

  it("two concurrent reassignments onto the same table: one wins, the other reports table_taken", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");
    const tableA = await makeTable(business.id);
    const tableB = await makeTable(business.id);
    const targetTable = await makeTable(business.id);
    const reservedFor = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const reservationA = await makeReservation(business.id, tableA.id, { reservedFor, status: "CONFIRMED" });
    const reservationB = await makeReservation(business.id, tableB.id, { reservedFor, status: "CONFIRMED" });

    const results = await runConcurrently([
      () => reassignReservationTableAction(reservationA.id, targetTable.id),
      () => reassignReservationTableAction(reservationB.id, targetTable.id),
    ]);
    const { fulfilled } = partitionSettled(results);

    expect(fulfilled).toHaveLength(2);
    const succeeded = fulfilled.filter((r) => r === undefined);
    const collided = fulfilled.filter((r) => r !== undefined);
    expect(succeeded).toHaveLength(1);
    expect(collided).toEqual([{ error: "table_taken" }]);
  });

  it("moves a confirmed reservation to a table with enough seats", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");
    const originalTable = await makeTable(business.id);
    const newTable = await makeTable(business.id, 6);
    const reservation = await makeReservation(business.id, originalTable.id, { status: "CONFIRMED", partySize: 5 });

    const result = await reassignReservationTableAction(reservation.id, newTable.id);

    expect(result).toBeUndefined();
    const updated = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
    expect(updated.tableId).toBe(newTable.id);
  });

  it("refuses a table too small for the party", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");
    const originalTable = await makeTable(business.id, 6);
    const smallTable = await makeTable(business.id, 2);
    const reservation = await makeReservation(business.id, originalTable.id, { status: "CONFIRMED", partySize: 5 });

    const result = await reassignReservationTableAction(reservation.id, smallTable.id);

    expect(result).toEqual({ error: "table_too_small" });
  });
});

describe("seatReservationAction", () => {
  it("reports not_found for an unknown reservation", async () => {
    await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");

    const result = await seatReservationAction("does-not-exist");

    expect(result).toEqual({ error: "not_found" });
  });

  it("rejects a caller outside STAFF_ROLES", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const user = await makeStaff("CUSTOMER");
    setTestSession(sessionUserFromRow(user));
    const table = await makeTable(business.id);
    const reservation = await makeReservation(business.id, table.id, { status: "CONFIRMED" });

    const result = await seatReservationAction(reservation.id);

    expect(result).toEqual({ error: "forbidden" });
  });

  it("refuses to seat a reservation that was never confirmed", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");
    const table = await makeTable(business.id);
    const reservation = await makeReservation(business.id, table.id, { status: "PENDING" });

    const result = await seatReservationAction(reservation.id);

    expect(result).toEqual({ error: "invalid_transition" });
  });

  it("seats a confirmed reservation", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");
    const table = await makeTable(business.id);
    const reservation = await makeReservation(business.id, table.id, { status: "CONFIRMED" });

    await seatReservationAction(reservation.id);

    const updated = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
    expect(updated.status).toBe("SEATED");
    expect(updated.seatedAt).not.toBeNull();
  });
});

describe("completeReservationAction", () => {
  it("reports not_found for an unknown reservation", async () => {
    await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");

    const result = await completeReservationAction("does-not-exist");

    expect(result).toEqual({ error: "not_found" });
  });

  it("rejects a caller outside STAFF_ROLES", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const user = await makeStaff("CUSTOMER");
    setTestSession(sessionUserFromRow(user));
    const table = await makeTable(business.id);
    const reservation = await makeReservation(business.id, table.id, { status: "SEATED" });

    const result = await completeReservationAction(reservation.id);

    expect(result).toEqual({ error: "forbidden" });
  });

  it("refuses to complete a reservation that was never seated", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");
    const table = await makeTable(business.id);
    const reservation = await makeReservation(business.id, table.id, { status: "CONFIRMED" });

    const result = await completeReservationAction(reservation.id);

    expect(result).toEqual({ error: "invalid_transition" });
  });

  it("completes a seated reservation", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");
    const table = await makeTable(business.id);
    const reservation = await makeReservation(business.id, table.id, { status: "SEATED" });

    await completeReservationAction(reservation.id);

    const updated = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
    expect(updated.status).toBe("COMPLETED");
  });
});

describe("markNoShowAction", () => {
  it("reports not_found for an unknown reservation", async () => {
    await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");

    const result = await markNoShowAction("does-not-exist");

    expect(result).toEqual({ error: "not_found" });
  });

  it("rejects a caller outside STAFF_ROLES", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const user = await makeStaff("CUSTOMER");
    setTestSession(sessionUserFromRow(user));
    const table = await makeTable(business.id);
    const reservation = await makeReservation(business.id, table.id, { status: "CONFIRMED" });

    const result = await markNoShowAction(reservation.id);

    expect(result).toEqual({ error: "forbidden" });
  });

  it("marks a CONFIRMED reservation as a no-show regardless of its start time", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");
    const table = await makeTable(business.id);
    const reservation = await makeReservation(business.id, table.id, {
      status: "CONFIRMED",
      reservedFor: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const result = await markNoShowAction(reservation.id);

    expect(result).toBeUndefined();
    const updated = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
    expect(updated.status).toBe("NO_SHOW");
  });

  it("refuses a reservation that's already past a no-show-able state", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");
    const table = await makeTable(business.id);
    const reservation = await makeReservation(business.id, table.id, { status: "COMPLETED" });

    const result = await markNoShowAction(reservation.id);

    expect(result).toEqual({ error: "invalid_transition" });
  });

  it("marks an overdue PENDING reservation as a no-show", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");
    const table = await makeTable(business.id);
    const reservation = await makeReservation(business.id, table.id, {
      status: "PENDING",
      reservedFor: new Date(Date.now() - 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    const result = await markNoShowAction(reservation.id);

    expect(result).toBeUndefined();
    const updated = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
    expect(updated.status).toBe("NO_SHOW");
  });

  it("refuses to mark a PENDING reservation no-show before its own start time", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");
    const table = await makeTable(business.id);
    const reservation = await makeReservation(business.id, table.id, { status: "PENDING" });

    const result = await markNoShowAction(reservation.id);

    expect(result).toEqual({ error: "not_overdue" });
  });
});

describe("cancelReservationAction", () => {
  it("reports not_found for an unknown reservation", async () => {
    await makeBusiness({ slug: "marea" });
    await loginAs("BUSINESS_ADMIN");

    const result = await cancelReservationAction("does-not-exist", "no such reservation");

    expect(result).toEqual({ error: "not_found" });
  });

  it("refuses to cancel a reservation that's already SEATED", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAs("BUSINESS_ADMIN");
    const table = await makeTable(business.id);
    const reservation = await makeReservation(business.id, table.id, { status: "SEATED" });

    const result = await cancelReservationAction(reservation.id, "guest asked to leave");

    expect(result).toEqual({ error: "invalid_transition" });
  });

  it("requires a non-blank reason", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAs("BUSINESS_ADMIN");
    const table = await makeTable(business.id);
    const reservation = await makeReservation(business.id, table.id, { status: "CONFIRMED" });

    const result = await cancelReservationAction(reservation.id, "   ");

    expect(result).toEqual({ error: "reason_required" });
  });

  it("cancels with a reason, admin-only", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAs("BUSINESS_ADMIN");
    const table = await makeTable(business.id);
    const reservation = await makeReservation(business.id, table.id, { status: "CONFIRMED" });

    const result = await cancelReservationAction(reservation.id, "guest called to cancel");

    expect(result).toBeUndefined();
    const updated = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
    expect(updated.status).toBe("CANCELLED");
    expect(updated.cancellationReason).toBe("guest called to cancel");
  });

  it("rejects a STAFF caller — cancelling is admin-only", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");
    const table = await makeTable(business.id);
    const reservation = await makeReservation(business.id, table.id);

    const result = await cancelReservationAction(reservation.id, "not allowed to do this");

    expect(result).toEqual({ error: "forbidden" });
  });
});
