// Shared by every integration test that needs to run a real checkout —
// factored out once both create-order.integration.test.ts and
// create-order.promotions.integration.test.ts needed the exact same
// cookie-jar-per-cart wiring.
import { createOrderFromCart, type GuestInfo } from "@/lib/orders/create-order";
import { runWithCookies } from "@/test/stubs/next-headers";
import { CART_COOKIE } from "@/lib/cart/cookie";
import type { Business } from "@/lib/generated/prisma/client";

export const defaultGuest: GuestInfo = {
  guestName: "Ana Ruiz",
  guestPhone: "+52 555 000 0000",
};

/** Runs createOrderFromCart as if the request carried `cart`'s own session cookie — each call gets its own isolated cookie jar, so two different carts' checkouts never see each other's token. */
export function checkout(
  cart: { sessionToken: string | null },
  business: Pick<Business, "id">,
  guestInfo: GuestInfo = defaultGuest
) {
  return runWithCookies({ [CART_COOKIE]: cart.sessionToken! }, () =>
    createOrderFromCart(business.id, "en", guestInfo)
  );
}
