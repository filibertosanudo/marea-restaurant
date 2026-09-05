import { cookies } from "next/headers";
import type { Lang } from "./lang";

export const ADMIN_LANG_COOKIE = "marea-lang";
export const ORDER_LANG_COOKIE = "marea-order-lang";

const VALID_LANGS: Lang[] = ["en", "es"];

function isLang(value: string | undefined): value is Lang {
  return value !== undefined && (VALID_LANGS as string[]).includes(value);
}

/**
 * Server-side read of the admin panel's language preference.
 * Independent of the landing's client-side `marea-lang` localStorage value —
 * this cookie only drives the admin UI chrome, never the content being edited.
 */
export async function getAdminLang(): Promise<Lang> {
  const cookieStore = await cookies();
  const value = cookieStore.get(ADMIN_LANG_COOKIE)?.value;
  return isLang(value) ? value : "es";
}

/**
 * Server-side language for the guest order flow (menu, cart, tracking).
 * A separate cookie (not the admin one, and not the landing's client-only
 * localStorage key) because this flow is server-rendered end to end —
 * switching language re-renders from the server instead of shipping every
 * locale to the client up front the way the landing page does.
 */
export async function getOrderLang(defaultLang: Lang = "es"): Promise<Lang> {
  const cookieStore = await cookies();
  const value = cookieStore.get(ORDER_LANG_COOKIE)?.value;
  return isLang(value) ? value : defaultLang;
}

export async function setOrderLang(lang: Lang): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ORDER_LANG_COOKIE, lang, {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
