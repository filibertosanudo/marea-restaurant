import "server-only";
import { prisma } from "@/lib/prisma";
import type { Lang } from "@/lib/i18n/lang";
import { toCartDTO, EMPTY_CART, type CartDTO } from "./dto";
import {
  getCartSessionToken,
  setCartSessionToken,
  generateCartSessionToken,
  getTableIdFromCookie,
} from "./cookie";

const CART_INCLUDE = {
  table: true,
  items: {
    orderBy: { createdAt: "asc" as const },
    include: {
      menuItem: { include: { translations: true } },
      modifiers: { include: { option: { include: { translations: true } } } },
    },
  },
};

/**
 * Read-only: safe to call from a Server Component. Never creates a cart or
 * writes a cookie — a first-time visitor who hasn't added anything yet has
 * no Cart row, and that's fine, it just renders as empty.
 */
export async function getCartWithLivePrices(businessId: string, lang: Lang): Promise<CartDTO> {
  const token = await getCartSessionToken();
  if (!token) return EMPTY_CART;

  const cart = await prisma.cart.findFirst({
    where: { sessionToken: token, businessId },
    include: CART_INCLUDE,
  });
  if (!cart) return EMPTY_CART;

  return toCartDTO(cart, lang);
}

/**
 * Read-write: only call from a Server Action or Route Handler (writes the
 * cart cookie on first use — cookies() can't be mutated during a Server
 * Component render). Creates the cart lazily, on the first mutation, rather
 * than on every /menu visit, so a browse-only guest never leaves an empty
 * Cart row behind. Keeps the cart's table/orderType in sync with the
 * `marea-table` cookie so scanning a QR mid-session re-attaches an existing
 * takeaway cart to the table instead of orphaning it.
 *
 * Known race, accepted: two concurrent calls that both see no cookie (e.g. a
 * double-tap on the very first "Agregar" of a session, before any cart
 * exists yet) can each create their own Cart row; only the last response's
 * Set-Cookie sticks, so the other request's CartItem becomes unreachable
 * from the browser. The add button is already disabled while its action is
 * pending, which closes the window for a UI-triggered double-tap; a request
 * forged directly against the action could still hit it, but the blast
 * radius is a self-limited, single-guest, first-add-only edge case — not
 * worth a cross-request lock for.
 */
export async function getOrCreateCartForMutation(businessId: string) {
  const tableId = await getTableIdFromCookie();
  const token = await getCartSessionToken();

  if (token) {
    const existing = await prisma.cart.findFirst({ where: { sessionToken: token, businessId } });
    if (existing) {
      if (tableId && (existing.tableId !== tableId || existing.orderType !== "DINE_IN")) {
        return prisma.cart.update({
          where: { id: existing.id },
          data: { tableId, orderType: "DINE_IN" },
        });
      }
      return existing;
    }
  }

  const newToken = generateCartSessionToken();
  const created = await prisma.cart.create({
    data: {
      businessId,
      sessionToken: newToken,
      tableId: tableId ?? null,
      orderType: tableId ? "DINE_IN" : "TAKEAWAY",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
    },
  });
  await setCartSessionToken(newToken);
  return created;
}

export async function getCartItemForMutation(cartId: string, cartItemId: string) {
  return prisma.cartItem.findFirst({ where: { id: cartItemId, cartId } });
}
