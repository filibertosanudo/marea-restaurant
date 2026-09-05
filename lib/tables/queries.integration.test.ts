import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { getTableByQrToken, getTableById, getTablesForAdmin, getCodesWithPrefix, getNextSortOrder } from "./queries";
import { makeBusiness } from "@/test/factories";

describe("getTableByQrToken", () => {
  it("resolves an active table by its qr token", async () => {
    const business = await makeBusiness();
    const table = await prisma.restaurantTable.create({ data: { businessId: business.id, code: "T-01", seats: 2 } });

    expect((await getTableByQrToken(business.id, table.qrToken))?.id).toBe(table.id);
  });

  it("returns null for an out-of-service table", async () => {
    const business = await makeBusiness();
    const table = await prisma.restaurantTable.create({
      data: { businessId: business.id, code: "T-01", seats: 2, status: "OUT_OF_SERVICE" },
    });

    expect(await getTableByQrToken(business.id, table.qrToken)).toBeNull();
  });
});

describe("getTableById", () => {
  it("returns null for a soft-deleted table", async () => {
    const business = await makeBusiness();
    const table = await prisma.restaurantTable.create({
      data: { businessId: business.id, code: "T-01", seats: 2, deletedAt: new Date() },
    });

    expect(await getTableById(business.id, table.id)).toBeNull();
  });
});

describe("getTablesForAdmin", () => {
  it("includes an inactive table but excludes a soft-deleted one", async () => {
    const business = await makeBusiness();
    await prisma.restaurantTable.create({ data: { businessId: business.id, code: "T-01", seats: 2, isActive: false } });
    await prisma.restaurantTable.create({
      data: { businessId: business.id, code: "T-02", seats: 2, deletedAt: new Date() },
    });

    const tables = await getTablesForAdmin(business.id);

    expect(tables).toHaveLength(1);
    expect(tables[0].code).toBe("T-01");
  });
});

describe("getCodesWithPrefix / getNextSortOrder", () => {
  it("returns matching codes and the next sort order", async () => {
    const business = await makeBusiness();
    await prisma.restaurantTable.create({ data: { businessId: business.id, code: "T-01", seats: 2, sortOrder: 5 } });
    await prisma.restaurantTable.create({ data: { businessId: business.id, code: "B-01", seats: 2, sortOrder: 1 } });

    expect(await getCodesWithPrefix(business.id, "T-")).toEqual(["T-01"]);
    expect(await getNextSortOrder(business.id)).toBe(6);
  });
});
