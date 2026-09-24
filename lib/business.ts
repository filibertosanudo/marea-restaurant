import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { Prisma, type Business } from "@/lib/generated/prisma/client";
import { cachedPublicRead, invalidatePublicCache } from "@/lib/cache/public";

const BUSINESS_SLUG = process.env.BUSINESS_SLUG ?? "marea";

/** Tag scope for the business row: its id isn't known until the row is read, so the slug stands in. */
export const BUSINESS_ROW_CACHE_SCOPE = BUSINESS_SLUG;

// The data cache stores JSON, which turns Date and Decimal columns into
// strings. Converting them explicitly, both ways, keeps `Business` honest
// for its 50-odd callers instead of leaving them typed as Decimal while
// holding a string. business.integration.test.ts round-trips a real row, so
// a new Date or Decimal column fails there instead of in production.
function toCacheable(b: Business) {
  return {
    ...b,
    taxRate: b.taxRate.toString(),
    latitude: b.latitude?.toString() ?? null,
    longitude: b.longitude?.toString() ?? null,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    deletedAt: b.deletedAt?.toISOString() ?? null,
  };
}

export function fromCacheable(c: ReturnType<typeof toCacheable>): Business {
  return {
    ...c,
    taxRate: new Prisma.Decimal(c.taxRate),
    latitude: c.latitude === null ? null : new Prisma.Decimal(c.latitude),
    longitude: c.longitude === null ? null : new Prisma.Decimal(c.longitude),
    createdAt: new Date(c.createdAt),
    updatedAt: new Date(c.updatedAt),
    deletedAt: c.deletedAt === null ? null : new Date(c.deletedAt),
  };
}

/** Expires the row (by slug) and everything keyed by business id; Server Actions only. */
export function invalidateBusinessCache(businessId: string): void {
  invalidatePublicCache("business", BUSINESS_ROW_CACHE_SCOPE);
  invalidatePublicCache("business", businessId);
}

/**
 * v1 is single-tenant: one Business row. Every catalog query still goes
 * through this instead of a hardcoded id so multi-tenant later is a filter
 * change, not a rewrite — see docs/DATABASE.md.
 *
 * Two levels, and they are not the same thing: React's cache() deduplicates
 * within one request (root layout.tsx's generateMetadata, its own render and
 * the page it wraps each call this and only the first goes further, same as
 * lib/auth/session.ts's getSession()), and the data cache underneath keeps
 * the row across requests, so that first call is usually not a query either.
 * The row's own `orderSequence` is stale in the cache by design; only the
 * checkout transaction reads it, and it reads it from the row it just locked.
 */
export const getCurrentBusiness = cache(async (): Promise<Business> => {
  const cached = await cachedPublicRead("business", "business-row", BUSINESS_ROW_CACHE_SCOPE, async () => {
    const business = await prisma.business.findUnique({
      where: { slug: BUSINESS_SLUG },
    });
    if (!business) {
      throw new Error(`Business "${BUSINESS_SLUG}" not found — did you run the seed?`);
    }
    return toCacheable(business);
  });
  return fromCacheable(cached);
});

const translationSelect = {
  locale: true,
  tagline: true,
  shortBlurb: true,
  aboutTitle: true,
  aboutBody: true,
  metaTitle: true,
  metaDescription: true,
} as const;

/**
 * Both locales' rows (or fewer, if a locale was never filled in) — used by
 * the admin content editor, which always reads live: the panel is never
 * served from the shared cache. metaTitle/metaDescription aren't editable in
 * the admin UI yet (Phase 4 only reads them), but are already columns on this
 * table from the schema's first migration.
 */
export const getBusinessTranslations = cache(async (businessId: string) => {
  return prisma.businessTranslation.findMany({ where: { businessId }, select: translationSelect });
});

/** The same rows for the public landing and generateMetadata, from the data cache. */
export const getPublicBusinessTranslations = cache(async (businessId: string) => {
  return cachedPublicRead("business", "business-translations", businessId, () =>
    prisma.businessTranslation.findMany({ where: { businessId }, select: translationSelect })
  );
});
