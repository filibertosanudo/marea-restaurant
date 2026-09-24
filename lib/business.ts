import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { Prisma, type Business } from "@/lib/generated/prisma/client";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { appOrigin, env } from "@/lib/env";
import { slugFromHost } from "@/lib/business-host";
import { cachedPublicRead, invalidatePublicCache } from "@/lib/cache/public";

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

// Three cache scopes, one per way a request can name a business. Every tag
// carries the business (its id, its slug, or the literal "default" for the
// bare-domain fallback) so two businesses never share an entry.
const idScope = (id: string) => id;
const slugScope = (slug: string) => `slug:${slug}`;
const DEFAULT_SCOPE = "default";

/** Expires every cached way of reaching this business's row; Server Actions only. */
export function invalidateBusinessCache(business: Pick<Business, "id" | "slug">): void {
  invalidatePublicCache("business", idScope(business.id));
  invalidatePublicCache("business", slugScope(business.slug));
  invalidatePublicCache("business", DEFAULT_SCOPE);
}

/** The domain subdomains hang off: BUSINESS_ROOT_DOMAIN, or the host of this deployment's own origin. */
function rootDomain(): string {
  return env.BUSINESS_ROOT_DOMAIN ?? new URL(appOrigin()).hostname;
}

async function byId(id: string): Promise<Business | null> {
  const cached = await cachedPublicRead("business", "business-row", idScope(id), async () => {
    const row = await prisma.business.findFirst({ where: { id, deletedAt: null } });
    return row ? toCacheable(row) : null;
  });
  return cached ? fromCacheable(cached) : null;
}

async function bySlug(slug: string): Promise<Business | null> {
  const cached = await cachedPublicRead("business", "business-row", slugScope(slug), async () => {
    const row = await prisma.business.findFirst({ where: { slug, deletedAt: null } });
    return row ? toCacheable(row) : null;
  });
  return cached ? fromCacheable(cached) : null;
}

/** The only business, when there is exactly one: keeps a single-tenant deployment working on any hostname. Two or more and a bare domain names nobody. */
async function onlyBusiness(): Promise<Business | null> {
  const cached = await cachedPublicRead("business", "business-row", DEFAULT_SCOPE, async () => {
    const rows = await prisma.business.findMany({ where: { deletedAt: null }, take: 2 });
    return rows.length === 1 ? toCacheable(rows[0]) : null;
  });
  return cached ? fromCacheable(cached) : null;
}

async function byHost(): Promise<Business | null> {
  const host = (await headers()).get("host") ?? "";
  const slug = slugFromHost(host, rootDomain());
  return slug ? bySlug(slug) : onlyBusiness();
}

/**
 * The business a public request is about, named by the host alone. Never
 * by the session: a staff member's cookie must not turn another business's
 * public page into their own (and an order placed there into theirs).
 * Anything reachable without requireRole uses this.
 *
 * Two levels, and they are not the same thing: React's cache() deduplicates
 * within one request, and the data cache underneath keeps the row across
 * requests, so the first call is usually not a query either. The row's own
 * `orderSequence` is stale in the cache by design; only the checkout
 * transaction reads it, and it reads it from the row it just locked.
 */
export const getPublicBusiness = cache(async (): Promise<Business> => {
  const business = await byHost();
  if (!business) notFound();
  return business;
});

/**
 * The business an authenticated panel request acts on: the one the session
 * was issued for. The JWT's businessId is re-checked against the
 * membership every 60 s (auth.ts), which is what makes it safe to trust
 * here. A session with no business (SUPER_ADMIN without a membership)
 * falls back to the host, like a public request. Call it after
 * requireRole/requirePageRole, never instead of them.
 */
export const getBusinessForRequest = cache(async (): Promise<Business> => {
  const session = await getSession();
  const sessionBusinessId = session?.user?.businessId;
  const business = sessionBusinessId ? await byId(sessionBusinessId) : await byHost();
  if (!business) notFound();
  return business;
});

/**
 * @deprecated Single-tenant, reads BUSINESS_SLUG. Use getPublicBusiness()
 * (public pages and actions) or getBusinessForRequest() (panel). Removed
 * once no caller is left, at the end of module 17's phase 2.
 */
export const getCurrentBusiness = cache(async (): Promise<Business> => {
  const business = await bySlug(env.BUSINESS_SLUG);
  if (!business) {
    throw new Error(`Business "${env.BUSINESS_SLUG}" not found — did you run the seed?`);
  }
  return business;
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
