import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { nextFolio, isDailyFolio } from "./folio";
import { makeBusiness, makeMenuCategory, makeMenuItem, makeCart, makeOrder } from "@/test/factories";
import { runConcurrently, partitionSettled } from "@/test/concurrency";
import { checkout } from "@/test/checkout";

describe("nextFolio", () => {
  it("numbers a business's day 001, 002, 003 in order", async () => {
    const business = await makeBusiness({ timezone: "UTC" });
    const now = new Date("2026-09-18T15:00:00Z");

    const folios = [];
    for (let i = 0; i < 3; i++) {
      folios.push(await prisma.$transaction((tx) => nextFolio(tx, business.id, "UTC", now)));
    }

    expect(folios).toEqual(["A-260918-001", "A-260918-002", "A-260918-003"]);
  });

  it("starts each day, and each business, from 001", async () => {
    const a = await makeBusiness({ timezone: "UTC" });
    const b = await makeBusiness({ timezone: "UTC" });
    const take = (businessId: string, iso: string) =>
      prisma.$transaction((tx) => nextFolio(tx, businessId, "UTC", new Date(iso)));

    expect(await take(a.id, "2026-09-18T10:00:00Z")).toBe("A-260918-001");
    expect(await take(a.id, "2026-09-18T11:00:00Z")).toBe("A-260918-002");
    expect(await take(a.id, "2026-09-19T10:00:00Z")).toBe("A-260919-001");
    expect(await take(b.id, "2026-09-18T10:00:00Z")).toBe("A-260918-001");
  });

  it("dates the folio in the business's timezone, not UTC", async () => {
    const business = await makeBusiness({ timezone: "America/Hermosillo" });

    // 05:00 UTC on the 19th is 22:00 on the 18th in Hermosillo (UTC-7).
    const folio = await prisma.$transaction((tx) =>
      nextFolio(tx, business.id, "America/Hermosillo", new Date("2026-09-19T05:00:00Z"))
    );

    expect(folio).toBe("A-260918-001");
  });

  it("does not consume a number when the surrounding transaction rolls back", async () => {
    const business = await makeBusiness({ timezone: "UTC" });
    const now = new Date("2026-09-18T15:00:00Z");

    await prisma
      .$transaction(async (tx) => {
        await nextFolio(tx, business.id, "UTC", now);
        throw new Error("checkout failed after taking the folio");
      })
      .catch(() => {});

    expect(await prisma.$transaction((tx) => nextFolio(tx, business.id, "UTC", now))).toBe("A-260918-001");
  });
});

describe("checkout folios", () => {
  async function cartWithOneItem(businessId: string, itemId: string) {
    const cart = await makeCart(businessId);
    await prisma.cartItem.create({ data: { cartId: cart.id, menuItemId: itemId, quantity: 1 } });
    return cart;
  }

  it("gives concurrent checkouts distinct, gap-free folios", async () => {
    const business = await makeBusiness({ timezone: "UTC" });
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id);
    const carts = await Promise.all(Array.from({ length: 12 }, () => cartWithOneItem(business.id, item.id)));

    const { fulfilled, rejected } = partitionSettled(
      await runConcurrently(carts.map((cart) => () => checkout(cart, business)))
    );

    expect(rejected).toEqual([]);
    const numbers = fulfilled.map((o) => o.orderNumber);
    expect(new Set(numbers).size).toBe(12);
    expect(numbers.every(isDailyFolio)).toBe(true);
    const running = numbers.map((n) => Number(n.split("-")[2])).sort((x, y) => x - y);
    expect(running).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });

  it("leaves Business.orderSequence alone and never collides with an order that has a legacy folio", async () => {
    const business = await makeBusiness({ timezone: "UTC", orderSequence: 41 });
    const legacy = await makeOrder(business.id, { orderNumber: "A-0042" });
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id);

    const order = await checkout(await cartWithOneItem(business.id, item.id), business);

    expect(isDailyFolio(order.orderNumber)).toBe(true);
    expect((await prisma.business.findUniqueOrThrow({ where: { id: business.id } })).orderSequence).toBe(41);
    const found = await prisma.order.findUnique({
      where: { businessId_orderNumber: { businessId: business.id, orderNumber: "A-0042" } },
    });
    expect(found?.id).toBe(legacy.id);
  });
});
