import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { addToCartAction, updateCartItemQuantityAction, removeCartItemAction, setTableCookieAction } from "./actions";
import { makeBusiness, makeMenuCategory, makeMenuItem } from "@/test/factories";
import { runWithCookies, cookies } from "@/test/stubs/next-headers";
import { TABLE_COOKIE } from "@/lib/cart/cookie";

function withCart<T>(fn: () => T) {
  return runWithCookies({}, fn);
}

describe("addToCartAction", () => {
  it("creates a cart and a cart item for a guest with no existing cart", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id);
    const formData = new FormData();
    formData.set("menuItemId", item.id);
    formData.set("quantity", "2");

    const result = await withCart(() => addToCartAction("en", undefined, formData));

    expect(result).toEqual({ success: true });
    const cartItem = await prisma.cartItem.findFirstOrThrow({ where: { menuItemId: item.id } });
    expect(cartItem.quantity).toBe(2);
  });

  it("refuses an unavailable dish", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, { isAvailable: false });
    const formData = new FormData();
    formData.set("menuItemId", item.id);
    formData.set("quantity", "1");

    const result = await withCart(() => addToCartAction("en", undefined, formData));

    expect(result).toEqual({ error: "item_unavailable" });
  });
});

describe("updateCartItemQuantityAction / removeCartItemAction", () => {
  it("updates an existing line's quantity", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id);
    const addForm = new FormData();
    addForm.set("menuItemId", item.id);
    addForm.set("quantity", "1");

    await withCart(async () => {
      await addToCartAction("en", undefined, addForm);
      const cartItem = await prisma.cartItem.findFirstOrThrow({ where: { menuItemId: item.id } });

      await updateCartItemQuantityAction(cartItem.id, 5);
      const updated = await prisma.cartItem.findUniqueOrThrow({ where: { id: cartItem.id } });
      expect(updated.quantity).toBe(5);

      await removeCartItemAction(cartItem.id);
      const deleted = await prisma.cartItem.findUnique({ where: { id: cartItem.id } });
      expect(deleted).toBeNull();
    });
  });

  it("deletes the line when the quantity is set to 0", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id);
    const addForm = new FormData();
    addForm.set("menuItemId", item.id);
    addForm.set("quantity", "1");

    await withCart(async () => {
      await addToCartAction("en", undefined, addForm);
      const cartItem = await prisma.cartItem.findFirstOrThrow({ where: { menuItemId: item.id } });

      await updateCartItemQuantityAction(cartItem.id, 0);
      const deleted = await prisma.cartItem.findUnique({ where: { id: cartItem.id } });
      expect(deleted).toBeNull();
    });
  });
});

describe("setTableCookieAction", () => {
  it("sets the table cookie for an active table in this business", async () => {
    const business = await makeBusiness({ slug: "marea" });
    const table = await prisma.restaurantTable.create({ data: { businessId: business.id, code: "T-01", seats: 4 } });

    await withCart(async () => {
      await setTableCookieAction(table.id);
      const store = cookies();
      expect(store.get(TABLE_COOKIE)?.value).toBe(table.id);
    });
  });

  it("does nothing for a table id from a different business", async () => {
    await makeBusiness({ slug: "marea" });
    const otherBusiness = await makeBusiness();
    const foreignTable = await prisma.restaurantTable.create({
      data: { businessId: otherBusiness.id, code: "T-01", seats: 4 },
    });

    await withCart(async () => {
      await setTableCookieAction(foreignTable.id);
      const store = cookies();
      expect(store.get(TABLE_COOKIE)).toBeUndefined();
    });
  });
});
