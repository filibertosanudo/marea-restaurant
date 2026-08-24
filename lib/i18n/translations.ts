import type { Lang } from "./lang";

/**
 * The one fallback rule for every per-locale text lookup in this app: the
 * requested locale's translation, else whatever translation exists first
 * (better than nothing), else undefined (caller falls back to a slug/id so
 * the UI never renders blank). Centralized so a future change to the rule
 * — e.g. preferring the business's defaultLocale over "whichever came
 * first" — happens in one place instead of wherever this got copy-pasted.
 */
export function pickTranslation<T extends { locale: string }>(
  translations: T[],
  lang: Lang
): T | undefined {
  return translations.find((t) => t.locale === lang) ?? translations[0];
}
