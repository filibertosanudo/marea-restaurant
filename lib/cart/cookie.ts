import "server-only";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";

export const CART_COOKIE = "marea-cart";
export const TABLE_COOKIE = "marea-table";

const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days — long enough to survive an app switch or a locked phone
const TABLE_COOKIE_MAX_AGE = 60 * 60 * 6; // one seating

/**
 * Opaque, unguessable identifier for the guest's cart cookie — generated in
 * app code with a CSPRNG, not Prisma's cuid() default (CUID v1 is a
 * structured id: timestamp + counter + process fingerprint, wrong for a
 * bearer token; same reasoning as Order.publicToken).
 */
export function generateCartSessionToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function getCartSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(CART_COOKIE)?.value;
}

export async function setCartSessionToken(token: string): Promise<void> {
  const store = await cookies();
  store.set(CART_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CART_COOKIE_MAX_AGE,
  });
}

export async function getTableIdFromCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(TABLE_COOKIE)?.value;
}

export async function setTableIdCookie(tableId: string): Promise<void> {
  const store = await cookies();
  store.set(TABLE_COOKIE, tableId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TABLE_COOKIE_MAX_AGE,
  });
}
