import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { listBoardPageRaw, countBoardOrdersRaw, listBoardOrdersByIdsRaw, BOARD_PAGE_SIZE } from "./queries";
import { makeBusiness, makeOrder } from "@/test/factories";

describe("listBoardPageRaw", () => {
  it("returns one column, oldest first, and says whether there is more", async () => {
    const business = await makeBusiness();
    const base = Date.now() - 10 * 60_000;
    for (let i = 0; i < 5; i++) {
      await makeOrder(business.id, { status: "PENDING", placedAt: new Date(base + i * 1000) });
    }
    await makeOrder(business.id, { status: "PREPARING" });

    const page = await listBoardPageRaw(business.id, "PENDING", {}, { take: 3 });

    expect(page.orders).toHaveLength(3);
    expect(page.hasMore).toBe(true);
    expect(page.orders.every((o) => o.status === "PENDING")).toBe(true);
    expect(page.orders.map((o) => o.placedAt.getTime())).toEqual([base, base + 1000, base + 2000]);
  });

  it("reports no more when the column fits exactly", async () => {
    const business = await makeBusiness();
    await makeOrder(business.id, { status: "PENDING" });
    await makeOrder(business.id, { status: "PENDING" });

    const page = await listBoardPageRaw(business.id, "PENDING", {}, { take: 2 });

    expect(page.orders).toHaveLength(2);
    expect(page.hasMore).toBe(false);
  });

  it("continues after a cursor without repeating or skipping, even when orders share a timestamp", async () => {
    const business = await makeBusiness();
    const sameInstant = new Date(Date.now() - 5 * 60_000);
    const created = [];
    for (let i = 0; i < 5; i++) {
      created.push(await makeOrder(business.id, { status: "PENDING", placedAt: sameInstant }));
    }
    const expectedOrder = created.map((o) => o.id).sort();

    const next = (page: Awaited<ReturnType<typeof listBoardPageRaw>>) => {
      const last = page.orders[page.orders.length - 1];
      return { take: 2, after: { placedAt: last.placedAt.toISOString(), id: last.id } };
    };
    const first = await listBoardPageRaw(business.id, "PENDING", {}, { take: 2 });
    const second = await listBoardPageRaw(business.id, "PENDING", {}, next(first));
    const third = await listBoardPageRaw(business.id, "PENDING", {}, next(second));

    expect([...first.orders, ...second.orders, ...third.orders].map((o) => o.id)).toEqual(expectedOrder);
    expect([first.hasMore, second.hasMore, third.hasMore]).toEqual([true, true, false]);
  });

  it("defaults to a page of 50, the cap a kitchen should never need to scroll past", () => {
    expect(BOARD_PAGE_SIZE).toBe(50);
  });

  it("keeps DELIVERED to the recent window, with the filters applied", async () => {
    const business = await makeBusiness();
    await makeOrder(business.id, { status: "DELIVERED", type: "TAKEAWAY" });
    await makeOrder(business.id, { status: "DELIVERED", type: "DINE_IN" });
    await makeOrder(business.id, {
      status: "DELIVERED",
      type: "TAKEAWAY",
      placedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    const page = await listBoardPageRaw(business.id, "DELIVERED", { orderType: "TAKEAWAY" });

    expect(page.orders).toHaveLength(1);
  });

  it("carries only what a card reads: the table's code and each line's name, quantity, note and modifiers", async () => {
    const business = await makeBusiness();
    const table = await prisma.restaurantTable.create({ data: { businessId: business.id, code: "T-07", seats: 4 } });
    const order = await makeOrder(business.id, { status: "PENDING", tableId: table.id });
    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        nameSnapshot: "Pescado",
        unitPrice: "10.00",
        quantity: 2,
        lineTotal: "20.00",
        notes: "sin cebolla",
        modifiers: { create: [{ nameSnapshot: "Extra limon", priceDelta: "1.00" }] },
      },
    });

    const [loaded] = (await listBoardPageRaw(business.id, "PENDING")).orders;

    expect(loaded.id).toBe(order.id);
    expect(loaded.table).toEqual({ code: "T-07" });
    expect(Object.keys(loaded.items[0]).sort()).toEqual(["id", "modifiers", "nameSnapshot", "notes", "quantity"]);
    expect(loaded.items[0].modifiers).toEqual([{ nameSnapshot: "Extra limon" }]);
  });
});

describe("countBoardOrdersRaw", () => {
  it("counts every column in one call, however many pages they would take", async () => {
    const business = await makeBusiness();
    await makeOrder(business.id, { status: "PENDING" });
    await makeOrder(business.id, { status: "PENDING" });
    await makeOrder(business.id, { status: "READY" });
    await makeOrder(business.id, { status: "DELIVERED" });
    await makeOrder(business.id, { status: "DELIVERED", placedAt: new Date(Date.now() - 24 * 60 * 60 * 1000) });
    await makeOrder(business.id, { status: "CANCELLED" });

    expect(await countBoardOrdersRaw(business.id)).toEqual({ PENDING: 2, PREPARING: 0, READY: 1, DELIVERED: 1 });
  });

  it("applies the board's filters and never counts another business", async () => {
    const business = await makeBusiness();
    const other = await makeBusiness();
    await makeOrder(business.id, { status: "PENDING", type: "TAKEAWAY" });
    await makeOrder(business.id, { status: "PENDING", type: "DINE_IN" });
    await makeOrder(other.id, { status: "PENDING", type: "TAKEAWAY" });

    expect((await countBoardOrdersRaw(business.id, { orderType: "TAKEAWAY" })).PENDING).toBe(1);
  });
});

describe("listBoardOrdersByIdsRaw", () => {
  it("returns the named orders in any status, so a card that moved on can be moved or dropped", async () => {
    const business = await makeBusiness();
    const pending = await makeOrder(business.id, { status: "PENDING" });
    const cancelled = await makeOrder(business.id, { status: "CANCELLED" });
    await makeOrder(business.id, { status: "PENDING" });

    const found = await listBoardOrdersByIdsRaw(business.id, [pending.id, cancelled.id]);

    expect(found.map((o) => o.id).sort()).toEqual([pending.id, cancelled.id].sort());
  });

  it("leaves out another business's order and one the board's filters would hide", async () => {
    const business = await makeBusiness();
    const other = await makeBusiness();
    const mine = await makeOrder(business.id, { status: "PENDING", type: "TAKEAWAY" });
    const hidden = await makeOrder(business.id, { status: "PENDING", type: "DINE_IN" });
    const foreign = await makeOrder(other.id, { status: "PENDING", type: "TAKEAWAY" });

    const found = await listBoardOrdersByIdsRaw(business.id, [mine.id, hidden.id, foreign.id], { orderType: "TAKEAWAY" });

    expect(found.map((o) => o.id)).toEqual([mine.id]);
  });
});
