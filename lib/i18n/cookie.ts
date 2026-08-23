import { cookies } from "next/headers";
import type { Lang } from "./lang";

export const ADMIN_LANG_COOKIE = "marea-lang";

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
