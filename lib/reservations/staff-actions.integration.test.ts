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
