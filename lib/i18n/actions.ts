"use server";

import { cookies } from "next/headers";
import { ADMIN_LANG_COOKIE, setOrderLang } from "./cookie";
import type { Lang } from "./lang";

const ONE_YEAR = 60 * 60 * 24 * 365;

export async function setAdminLangAction(lang: Lang) {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_LANG_COOKIE, lang, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
  });
}

export async function setOrderLangAction(lang: Lang) {
  await setOrderLang(lang);
}
