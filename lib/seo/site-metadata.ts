import { findPublicBusiness, getPublicBusinessTranslations } from "@/lib/business";
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
  // Never 404s: this is also the fallback for the admin panel and for a host
  // that names no business, where there is no business to describe. The public
  // pages that need one resolve it themselves and 404 there.
  const business = await findPublicBusiness();
  if (!business) return { title: "Marea", description: "Marea" };
  const translations = await getPublicBusinessTranslations(business.id);
  const t = pickTranslation(translations, business.defaultLocale as Lang);

  return {
    title: t?.metaTitle || business.name,
    description: t?.metaDescription || t?.tagline || business.name,
  };
}
