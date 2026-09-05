import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createTableAction,
  createTablesBatchAction,
  updateTableAction,
  toggleTableActiveAction,
  toggleOutOfServiceAction,
  reorderTablesAction,
  rotateTableQrAction,
  deleteTableAction,
} from "./actions";
import { makeBusiness, makeStaff } from "@/test/factories";
import { setTestSession, sessionUserFromRow } from "@/test/stubs/auth-session";

async function loginAsAdmin() {
  const user = await makeStaff("BUSINESS_ADMIN");
  setTestSession(sessionUserFromRow(user));
}

function tableForm(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("createTableAction", () => {
  it("creates a table", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();

    const result = await createTableAction(undefined, tableForm({ code: "T-01", zone: "Terrace", seats: "4" }));

    expect(result).toEqual({ success: true });
    const table = await prisma.restaurantTable.findFirstOrThrow({ where: { businessId: business.id } });
    expect(table.code).toBe("T-01");
  });

  it("reports code_taken instead of a raw error on a duplicate code", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    await prisma.restaurantTable.create({ data: { businessId: business.id, code: "T-01", seats: 4 } });

    const result = await createTableAction(undefined, tableForm({ code: "T-01", zone: "", seats: "2" }));

    expect(result).toMatchObject({ error: "code_taken" });
  });
});

describe("createTablesBatchAction", () => {
  it("creates a whole batch of numbered tables", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();

    const result = await createTablesBatchAction(
      undefined,
      tableForm({ zone: "", seats: "2", quantity: "5", codePrefix: "T-" })
    );

    expect(result).toEqual({ success: true });
    const count = await prisma.restaurantTable.count({ where: { businessId: business.id } });
    expect(count).toBe(5);
  });
});

describe("updateTableAction", () => {
  it("updates an existing table", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const table = await prisma.restaurantTable.create({ data: { businessId: business.id, code: "T-01", seats: 2 } });

    const result = await updateTableAction(undefined, tableForm({ id: table.id, code: "T-02", zone: "", seats: "6" }));

    expect(result).toEqual({ success: true });
    const updated = await prisma.restaurantTable.findUniqueOrThrow({ where: { id: table.id } });
    expect(updated.code).toBe("T-02");
    expect(updated.seats).toBe(6);
  });

  it("reports not_found for a table outside this business", async () => {
    await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const otherBusiness = await makeBusiness();
    const foreignTable = await prisma.restaurantTable.create({
      data: { businessId: otherBusiness.id, code: "T-01", seats: 2 },
    });

    const result = await updateTableAction(undefined, tableForm({ id: foreignTable.id, code: "T-02", zone: "", seats: "2" }));

    expect(result).toEqual({ error: "not_found" });
  });
});

describe("toggleTableActiveAction", () => {
  it("toggles a table's active flag", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const table = await prisma.restaurantTable.create({ data: { businessId: business.id, code: "T-01", seats: 2 } });

    await toggleTableActiveAction(table.id, false);

    const updated = await prisma.restaurantTable.findUniqueOrThrow({ where: { id: table.id } });
    expect(updated.isActive).toBe(false);
  });
});

describe("toggleOutOfServiceAction", () => {
  it("blocks marking a table out of service while it still holds an upcoming reservation", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const table = await prisma.restaurantTable.create({ data: { businessId: business.id, code: "T-01", seats: 2 } });
    const reservedFor = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.reservation.create({
      data: {
        businessId: business.id,
        tableId: table.id,
        guestName: "Ana",
        partySize: 2,
        reservedFor,
        endsAt: new Date(reservedFor.getTime() + 90 * 60 * 1000),
        status: "CONFIRMED",
      },
    });

    const result = await toggleOutOfServiceAction(table.id, true);

    expect(result).toEqual({ blocked: true });
    const unchanged = await prisma.restaurantTable.findUniqueOrThrow({ where: { id: table.id } });
    expect(unchanged.status).toBe("AVAILABLE");
  });

  it("marks a table out of service when nothing blocks it", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const table = await prisma.restaurantTable.create({ data: { businessId: business.id, code: "T-01", seats: 2 } });

    const result = await toggleOutOfServiceAction(table.id, true);

    expect(result).toEqual({ blocked: false });
    const updated = await prisma.restaurantTable.findUniqueOrThrow({ where: { id: table.id } });
    expect(updated.status).toBe("OUT_OF_SERVICE");
  });
});

describe("reorderTablesAction", () => {
  it("applies the given order as each table's sortOrder", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const a = await prisma.restaurantTable.create({ data: { businessId: business.id, code: "A", seats: 2 } });
    const b = await prisma.restaurantTable.create({ data: { businessId: business.id, code: "B", seats: 2 } });

    await reorderTablesAction([b.id, a.id]);

    const updatedA = await prisma.restaurantTable.findUniqueOrThrow({ where: { id: a.id } });
    const updatedB = await prisma.restaurantTable.findUniqueOrThrow({ where: { id: b.id } });
    expect(updatedB.sortOrder).toBe(0);
    expect(updatedA.sortOrder).toBe(1);
  });
});

describe("rotateTableQrAction", () => {
  it("rotates a table's qrToken", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const table = await prisma.restaurantTable.create({ data: { businessId: business.id, code: "T-01", seats: 2 } });

    const result = await rotateTableQrAction(table.id);

    expect(result).toEqual({});
    const updated = await prisma.restaurantTable.findUniqueOrThrow({ where: { id: table.id } });
    expect(updated.qrToken).not.toBe(table.qrToken);
  });

  it("reports not_found for an already-deleted table", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const table = await prisma.restaurantTable.create({
      data: { businessId: business.id, code: "T-01", seats: 2, deletedAt: new Date() },
    });

    const result = await rotateTableQrAction(table.id);

    expect(result).toEqual({ error: "not_found" });
  });
});

describe("deleteTableAction", () => {
  it("blocks deleting a table that still holds an upcoming reservation", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const table = await prisma.restaurantTable.create({ data: { businessId: business.id, code: "T-01", seats: 2 } });
    const reservedFor = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.reservation.create({
      data: {
        businessId: business.id,
        tableId: table.id,
        guestName: "Ana",
        partySize: 2,
        reservedFor,
        endsAt: new Date(reservedFor.getTime() + 90 * 60 * 1000),
        status: "PENDING",
      },
    });

    const result = await deleteTableAction(table.id);

    expect(result).toEqual({ blocked: true });
    const unchanged = await prisma.restaurantTable.findUniqueOrThrow({ where: { id: table.id } });
    expect(unchanged.deletedAt).toBeNull();
  });

  it("soft-deletes and mangles the code when nothing blocks it", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const table = await prisma.restaurantTable.create({ data: { businessId: business.id, code: "T-01", seats: 2 } });

    const result = await deleteTableAction(table.id);

    expect(result).toEqual({ blocked: false });
    const updated = await prisma.restaurantTable.findUniqueOrThrow({ where: { id: table.id } });
    expect(updated.deletedAt).not.toBeNull();
    expect(updated.code).toContain("::deleted::");
  });
});
