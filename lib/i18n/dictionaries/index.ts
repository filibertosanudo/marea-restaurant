import type { Lang } from "../lang";
import { en } from "./en";
import { es } from "./es";

export const dictionaries = { en, es } satisfies Record<Lang, typeof en>;

export type AdminDictionary = (typeof dictionaries)[Lang]["admin"];
export type OrderDictionary = (typeof dictionaries)[Lang]["order"];

export function getDictionary(lang: Lang): AdminDictionary {
  return dictionaries[lang].admin;
}

export function getOrderDictionary(lang: Lang): OrderDictionary {
  return dictionaries[lang].order;
}
