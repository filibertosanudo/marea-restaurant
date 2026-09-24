import { getPublicBusiness, getPublicBusinessTranslations } from "@/lib/business";
import { pickTranslation } from "@/lib/i18n/translations";
import type { Lang } from "@/lib/i18n/lang";

/**
 * The one title/description resolution every page's metadata builds on —
 * the root layout uses it as-is for the site-wide fallback, the homepage
 * extends it with Open Graph/Twitter fields. Both calls are free past the
 * first: getPublicBusiness/getPublicBusinessTranslations are wrapped in React's
 * cache().
 */
export async function resolveSiteMetadataText(): Promise<{ title: string; description: string }> {
  const business = await getPublicBusiness();
  const translations = await getPublicBusinessTranslations(business.id);
  const t = pickTranslation(translations, business.defaultLocale as Lang);

  return {
    title: t?.metaTitle || business.name,
    description: t?.metaDescription || t?.tagline || business.name,
  };
}
