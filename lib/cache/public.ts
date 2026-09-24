import "server-only";
import { unstable_cache, updateTag } from "next/cache";

/**
 * The public site's read cache: the landing and menu are read thousands of
 * times a day and change a couple of times a week.
 *
 * unstable_cache, not `use cache`: the latter needs `cacheComponents: true`,
 * which prerenders cached data at build time. This app keeps its root layout
 * `force-dynamic` precisely so `next build` never needs a live database (see
 * app/layout.tsx), and the flag rejects that export outright. unstable_cache
 * fills lazily at runtime and works without the flag.
 *
 * Only ever wrap reads that are identical for every visitor. Nothing that
 * depends on the session, a cookie or a header goes through here, and
 * nothing from the admin panel: a cached panel response would be shared
 * between users.
 */

export type PublicCacheKind = "menu" | "business" | "promotions" | "testimonials" | "hours";

/** Safety net for the other replicas: a tag update only reaches the instance that ran the action. */
export const PUBLIC_CACHE_TTL_SECONDS = 60;

export function publicCacheTag(kind: PublicCacheKind, scope: string): string {
  return `${kind}:${scope}`;
}

/**
 * The cached values are JSON round-tripped by Next: a Date comes back as a
 * string and a Decimal as a string too. Every loader passed here must return
 * JSON-safe data (or rehydrate at the call site) -- the type below only
 * rules out the shapes that can't survive at all.
 */
export type JsonSafe = string | number | boolean | null | JsonSafe[] | { [key: string]: JsonSafe };

export function cachedPublicRead<T extends JsonSafe>(
  kind: PublicCacheKind,
  name: string,
  scope: string,
  load: () => Promise<T>
): Promise<T> {
  return unstable_cache(load, [name, scope], {
    tags: [publicCacheTag(kind, scope)],
    revalidate: PUBLIC_CACHE_TTL_SECONDS,
  })();
}

/**
 * Expires the entry so the next read is a blocking miss, not a stale hit:
 * an admin who just edited a dish must see it on the public menu right away.
 * `updateTag` only exists inside Server Actions, which is where every caller
 * of this is.
 */
export function invalidatePublicCache(kind: PublicCacheKind, scope: string): void {
  updateTag(publicCacheTag(kind, scope));
}
