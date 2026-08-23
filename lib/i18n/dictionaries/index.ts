import type { Lang } from "../lang";
import { en } from "./en";
import { es } from "./es";

export const dictionaries = { en, es } satisfies Record<Lang, typeof en>;

export type AdminDictionary = (typeof dictionaries)[Lang]["admin"];

export function getDictionary(lang: Lang): AdminDictionary {
  return dictionaries[lang].admin;
}
