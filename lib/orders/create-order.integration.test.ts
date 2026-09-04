import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { createOrderFromCart, CheckoutError } from "./create-order";
import { makeBusiness, makeMenuCategory, makeMenuItem, makeCart } from "@/test/factories";
import { runWithCookies } from "@/test/stubs/next-headers";
import { CART_COOKIE } from "@/lib/cart/cookie";
import { runConcurrently, partitionSettled } from "@/test/concurrency";
import type { Business } from "@/lib/generated/prisma/client";

const guest: { guestName: string; guestPhone: string; guestEmail?: string } = {
  guestName: "Ana Ruiz",
  guestPhone: "+52 555 000 0000",
};

/** Runs createOrderFromCart as if the request carried `cart`'s own session cookie — each call gets its own isolated cookie jar, so two different carts' checkouts never see each other's token. */
function checkout(cart: { sessionToken: string | null }, business: Pick<Business, "id">, guestInfo = guest) {
  return runWithCookies({ [CART_COOKIE]: cart.sessionToken! }, () =>
    createOrderFromCart(business.id, "en", guestInfo)
  );
}

describe("createOrderFromCart", () => {
  it("freezes the order's price at the moment it's created, immune to later basePrice changes", async () => {
    const business = await makeBusiness();
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, { basePrice: "10.00" });
    const cart = await makeCart(business.id);
    await prisma.cartItem.create({ data: { cartId: cart.id, menuItemId: item.id, quantity: 1 } });

    // Changed after adding to cart, before checkout — the cart itself has
    // no snapshot (it references the live price), so the order should
    // reflect this new value, not the one at add-to-cart time.
    await prisma.menuItem.update({ where: { id: item.id }, data: { basePrice: "15.00" } });

    const order = await checkout(cart, business);
    const orderItem = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    expect(orderItem.unitPrice.toString()).toBe("15");

    // Changed again, after the order already exists — this must NOT move.
    await prisma.menuItem.update({ where: { id: item.id }, data: { basePrice: "20.00" } });
    const frozen = await prisma.orderItem.findUniqueOrThrow({ where: { id: orderItem.id } });
    expect(frozen.unitPrice.toString()).toBe("15");
  });

  it("computes tax on an ugly-decimal case, not a round number", async () => {
    const business = await makeBusiness({ taxRate: "0.16" });
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, { basePrice: "19.99" });
    const cart = await makeCart(business.id);
    await prisma.cartItem.create({ data: { cartId: cart.id, menuItemId: item.id, quantity: 1 } });

    const order = await checkout(cart, business);

    expect(order.subtotal.toString()).toBe("19.99");
    // 19.99 * 0.16 = 3.1984, rounded to 2 places.
    expect(order.taxTotal.toString()).toBe("3.2");
    expect(order.total.toString()).toBe("23.19");
  });

  it("rejects an empty cart", async () => {
    const business = await makeBusiness();
    const cart = await makeCart(business.id);

    await expect(checkout(cart, business)).rejects.toMatchObject({ code: "empty_cart" });
  });

  it("rejects checkout with no cart cookie at all", async () => {
    const business = await makeBusiness();

    await expect(checkout({ sessionToken: null }, business)).rejects.toMatchObject({
      code: "empty_cart",
    });
  });

  it("two simultaneous checkouts on the same cart produce exactly one order", async () => {
    const business = await makeBusiness();
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, { basePrice: "10.00" });
    const cart = await makeCart(business.id);
    await prisma.cartItem.create({ data: { cartId: cart.id, menuItemId: item.id, quantity: 1 } });

    const results = await runConcurrently([
      () => checkout(cart, business),
      () => checkout(cart, business),
    ]);
    const { fulfilled, rejected } = partitionSettled(results);

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as CheckoutError).code).toBe("empty_cart");

    const orderCount = await prisma.order.count({ where: { businessId: business.id } });
    expect(orderCount).toBe(1);
  });

  it("two concurrent checkouts on stock of 1 never take it negative", async () => {
    const business = await makeBusiness();
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, {
      basePrice: "10.00",
      trackInventory: true,
      stockQuantity: 1,
    });
    const cartA = await makeCart(business.id);
    const cartB = await makeCart(business.id);
    await prisma.cartItem.create({ data: { cartId: cartA.id, menuItemId: item.id, quantity: 1 } });
    await prisma.cartItem.create({ data: { cartId: cartB.id, menuItemId: item.id, quantity: 1 } });

    const results = await runConcurrently([
      () => checkout(cartA, business),
      () => checkout(cartB, business),
    ]);
    const { fulfilled, rejected } = partitionSettled(results);

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as CheckoutError).code).toBe("item_unavailable");

    const final = await prisma.menuItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(final.stockQuantity).toBe(0);
    expect(final.isAvailable).toBe(false);
  });

  it("rejects a discontinued dish", async () => {
    const business = await makeBusiness();
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, { deletedAt: new Date() });
    const cart = await makeCart(business.id);
    await prisma.cartItem.create({ data: { cartId: cart.id, menuItemId: item.id, quantity: 1 } });

    await expect(checkout(cart, business)).rejects.toMatchObject({ code: "item_unavailable" });
  });

  it("rejects a dish whose category was deactivated after it was carted", async () => {
    const business = await makeBusiness();
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id);
    const cart = await makeCart(business.id);
    await prisma.cartItem.create({ data: { cartId: cart.id, menuItemId: item.id, quantity: 1 } });

    await prisma.menuCategory.update({ where: { id: category.id }, data: { isActive: false } });

    await expect(checkout(cart, business)).rejects.toMatchObject({ code: "item_unavailable" });
  });

  it("rejects a cart holding a modifier option that became unavailable", async () => {
    const business = await makeBusiness();
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id);
    const group = await prisma.modifierGroup.create({
      data: { businessId: business.id, slug: "size" },
    });
    const option = await prisma.modifierOption.create({
      data: { groupId: group.id, slug: "large" },
    });
    await prisma.menuItemModifierGroup.create({
      data: { menuItemId: item.id, groupId: group.id },
    });
    const cart = await makeCart(business.id);
    const cartItem = await prisma.cartItem.create({
      data: { cartId: cart.id, menuItemId: item.id, quantity: 1 },
    });
    await prisma.cartItemModifier.create({
      data: { cartItemId: cartItem.id, modifierOptionId: option.id },
    });

    await prisma.modifierOption.update({ where: { id: option.id }, data: { isAvailable: false } });

    await expect(checkout(cart, business)).rejects.toMatchObject({ code: "modifier_unavailable" });
  });

  it("rejects a cart whose modifier group became required after it was carted", async () => {
    const business = await makeBusiness();
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id);
    const group = await prisma.modifierGroup.create({
      data: { businessId: business.id, slug: "size", isRequired: false },
    });
    await prisma.modifierOption.create({ data: { groupId: group.id, slug: "large" } });
    await prisma.menuItemModifierGroup.create({
      data: { menuItemId: item.id, groupId: group.id },
    });
    const cart = await makeCart(business.id);
    // Cart item picks no option from the group — legal while it's optional.
    await prisma.cartItem.create({ data: { cartId: cart.id, menuItemId: item.id, quantity: 1 } });

    await prisma.modifierGroup.update({ where: { id: group.id }, data: { isRequired: true } });

    await expect(checkout(cart, business)).rejects.toMatchObject({ code: "modifier_invalid" });
  });

  it("creates the confirmation NotificationJob inside the same transaction that creates the order", async () => {
    const business = await makeBusiness();
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id);
    const cart = await makeCart(business.id);
    await prisma.cartItem.create({ data: { cartId: cart.id, menuItemId: item.id, quantity: 1 } });

    const order = await checkout(cart, business, { ...guest, guestEmail: "ana@example.com" });

    const job = await prisma.notificationJob.findFirst({ where: { relatedOrderId: order.id } });
    expect(job).not.toBeNull();
    expect(job?.templateKey).toBe("order.confirmed");
  });

  it("leaves no orphaned NotificationJob when the order fails to create", async () => {
    const business = await makeBusiness();
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, { deletedAt: new Date() });
    const cart = await makeCart(business.id);
    await prisma.cartItem.create({ data: { cartId: cart.id, menuItemId: item.id, quantity: 1 } });

    await expect(
      checkout(cart, business, { ...guest, guestEmail: "ana@example.com" })
    ).rejects.toMatchObject({ code: "item_unavailable" });

    const jobCount = await prisma.notificationJob.count({ where: { businessId: business.id } });
    expect(jobCount).toBe(0);
  });
});
