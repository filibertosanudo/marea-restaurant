import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { createOrderAction } from "./actions";
import { makeBusiness, makeMenuCategory, makeMenuItem, makeCart } from "@/test/factories";
import { runWithCookies } from "@/test/stubs/next-headers";
import { CART_COOKIE } from "@/lib/cart/cookie";

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function checkout(cart: { sessionToken: string | null }, business: { id: string }, fields: Record<string, string>) {
  return runWithCookies({ [CART_COOKIE]: cart.sessionToken! }, () =>
    createOrderAction("en", undefined, formData(fields))
  );
}

describe("createOrderAction", () => {
  it("returns field errors for invalid input instead of calling the checkout at all", async () => {
    const business = await makeBusiness({ slug: "marea" }); // createOrderAction calls getCurrentBusiness(), which looks up by this fixed slug
    const cart = await makeCart(business.id);

    const result = await checkout(cart, business, { guestName: "", guestPhone: "" });

    expect(result).toMatchObject({ error: "invalid_input" });
    expect((result as { fieldErrors: Record<string, string> }).fieldErrors).toHaveProperty("guestName");
  });

  it("translates a CheckoutError from createOrderFromCart into the matching state", async () => {
    const business = await makeBusiness({ slug: "marea" }); // createOrderAction calls getCurrentBusiness(), which looks up by this fixed slug
    const cart = await makeCart(business.id); // empty cart

    const result = await checkout(cart, business, { guestName: "Ana Ruiz", guestPhone: "+52 555 000 0000" });

    expect(result).toEqual({ error: "empty_cart" });
  });

  it("redirects to the public order page once checkout succeeds", async () => {
    const business = await makeBusiness({ slug: "marea" }); // createOrderAction calls getCurrentBusiness(), which looks up by this fixed slug
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id);
    const cart = await makeCart(business.id);
    await prisma.cartItem.create({ data: { cartId: cart.id, menuItemId: item.id, quantity: 1 } });

    await expect(
      checkout(cart, business, { guestName: "Ana Ruiz", guestPhone: "+52 555 000 0000" })
    ).rejects.toThrow(/^REDIRECT:\/o\//);

    const order = await prisma.order.findFirstOrThrow({ where: { businessId: business.id } });
    expect(order.guestName).toBe("Ana Ruiz");
  });
});
