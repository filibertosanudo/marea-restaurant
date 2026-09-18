import "server-only";
import { prisma } from "@/lib/prisma";

const BUSINESS_SLUG = process.env.BUSINESS_SLUG ?? "marea";

/**
 * v1 is single-tenant: one Business row. Every catalog query still goes
 * through this instead of a hardcoded id so multi-tenant later is a filter
 * change, not a rewrite — see docs/DATABASE.md.
 */
export async function getCurrentBusiness() {
  const business = await prisma.business.findUnique({
    where: { slug: BUSINESS_SLUG },
  });
  if (!business) {
    throw new Error(`Business "${BUSINESS_SLUG}" not found — did you run the seed?`);
  }
  return business;
}

/** Both locales' rows (or fewer, if a locale was never filled in) — used by the admin content editor and the public landing alike, since both need the same per-locale about/tagline/blurb text. */
export async function getBusinessTranslations(businessId: string) {
  return prisma.businessTranslation.findMany({
    where: { businessId },
    select: { locale: true, tagline: true, shortBlurb: true, aboutTitle: true, aboutBody: true },
  });
}
