import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { listBoardOrdersRaw, listCancelledOrdersRaw, listActiveTablesRaw, getOrderByPublicToken } from "./queries";
import { makeBusiness, makeOrder } from "@/test/factories";

describe("listBoardOrdersRaw", () => {
  it("includes live statuses and filters by table", async () => {
    const business = await makeBusiness();
    const table = await prisma.restaurantTable.create({ data: { businessId: business.id, code: "T-01", seats: 2 } });
    await makeOrder(business.id, { status: "PENDING", tableId: table.id });
    await makeOrder(business.id, { status: "DELIVERED", placedAt: new Date(Date.now() - 24 * 60 * 60 * 1000) });

    const orders = await listBoardOrdersRaw(business.id, { tableId: table.id });

    expect(orders).toHaveLength(1);
    expect(orders[0].tableId).toBe(table.id);
  });

  it("filters by order type", async () => {
    const business = await makeBusiness();
    await makeOrder(business.id, { status: "PENDING", type: "DINE_IN" });
    await makeOrder(business.id, { status: "PENDING", type: "TAKEAWAY" });

    const orders = await listBoardOrdersRaw(business.id, { orderType: "TAKEAWAY" });

    expect(orders).toHaveLength(1);
    expect(orders[0].type).toBe("TAKEAWAY");
  });
});

describe("listCancelledOrdersRaw", () => {
  it("lists only cancelled orders within the recent window", async () => {
    const business = await makeBusiness();
    await makeOrder(business.id, { status: "CANCELLED", cancelledAt: new Date() });
    await makeOrder(business.id, { status: "PENDING" });

    const orders = await listCancelledOrdersRaw(business.id);

    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe("CANCELLED");
  });

  it("filters by order type and table", async () => {
    const business = await makeBusiness();
    const table = await prisma.restaurantTable.create({ data: { businessId: business.id, code: "T-01", seats: 2 } });
    await makeOrder(business.id, { status: "CANCELLED", cancelledAt: new Date(), type: "TAKEAWAY" });
    await makeOrder(business.id, {
      status: "CANCELLED",
      cancelledAt: new Date(),
      type: "DINE_IN",
      tableId: table.id,
    });

    const orders = await listCancelledOrdersRaw(business.id, { orderType: "DINE_IN", tableId: table.id });

    expect(orders).toHaveLength(1);
    expect(orders[0].tableId).toBe(table.id);
  });
});

describe("listActiveTablesRaw", () => {
  it("excludes an inactive table", async () => {
    const business = await makeBusiness();
    await prisma.restaurantTable.create({ data: { businessId: business.id, code: "T-01", seats: 2, isActive: false } });
    await prisma.restaurantTable.create({ data: { businessId: business.id, code: "T-02", seats: 2 } });

    const tables = await listActiveTablesRaw(business.id);

    expect(tables).toHaveLength(1);
    expect(tables[0].code).toBe("T-02");
  });
});

describe("getOrderByPublicToken", () => {
  it("finds an order by its public token, scoped to the business", async () => {
    const business = await makeBusiness();
    const order = await makeOrder(business.id);

    const found = await getOrderByPublicToken(business.id, order.publicToken);

    expect(found?.id).toBe(order.id);
  });

  it("returns null for a token from a different business", async () => {
    const business = await makeBusiness();
    const otherBusiness = await makeBusiness();
    const order = await makeOrder(otherBusiness.id);

    expect(await getOrderByPublicToken(business.id, order.publicToken)).toBeNull();
  });
});
