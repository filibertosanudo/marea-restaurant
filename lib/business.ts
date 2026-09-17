import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

const BUSINESS_SLUG = process.env.BUSINESS_SLUG ?? "marea";

/**
 * v1 is single-tenant: one Business row. Every catalog query still goes
 * through this instead of a hardcoded id so multi-tenant later is a filter
 * change, not a rewrite — see docs/DATABASE.md.
 *
 * Wrapped in React's cache() the same way lib/auth/session.ts's getSession()
 * is: root layout.tsx's generateMetadata, its own render, and whatever page
 * it wraps can each call this and only the first actually hits the
 * database within one request.
 */
export const getCurrentBusiness = cache(async () => {
  const business = await prisma.business.findUnique({
    where: { slug: BUSINESS_SLUG },
  });
  if (!business) {
    throw new Error(`Business "${BUSINESS_SLUG}" not found — did you run the seed?`);
  }
  return business;
});

/**
 * Both locales' rows (or fewer, if a locale was never filled in) — used by
 * the admin content editor, the public landing, and generateMetadata alike,
 * since all three need the same per-locale text. metaTitle/metaDescription
 * aren't editable in the admin UI yet (Phase 4 only reads them), but are
 * already columns on this table from the schema's first migration.
 */
export const getBusinessTranslations = cache(async (businessId: string) => {
  return prisma.businessTranslation.findMany({
    where: { businessId },
    select: {
      locale: true,
      tagline: true,
      shortBlurb: true,
      aboutTitle: true,
      aboutBody: true,
      metaTitle: true,
      metaDescription: true,
    },
  });
});
