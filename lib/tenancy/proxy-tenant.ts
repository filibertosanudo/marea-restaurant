import "server-only";
import { businessIdForSlug, onlyBusinessId } from "@/lib/tenancy/discover";
import { appOrigin, env } from "@/lib/env";
import { slugFromHost } from "@/lib/business-host";

/**
 * The business a request acts for, decided once in proxy.ts and passed on in
 * the x-marea-tenant header for the database connection to pick up (see
 * lib/tenancy/context.ts). Same order as getBusinessForRequest(): the
 * session's business if there is one, else the one the host names, else the
 * only business there is.
 *
 * This is what row level security is told, not what the application
 * queries. Every query still filters by the business the page resolved for
 * itself, so a disagreement between the two can only make a page find
 * nothing, never find more.
 */

type Entry = { id: string | null; at: number };
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, Entry>();

async function remembered(key: string, load: () => Promise<string | null>): Promise<string | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.id;
  const id = await load();
  cache.set(key, { id, at: Date.now() });
  return id;
}

export async function tenantForRequest(input: {
  sessionBusinessId: string | null | undefined;
  host: string;
}): Promise<string | null> {
  if (input.sessionBusinessId) return input.sessionBusinessId;

  const root = env.BUSINESS_ROOT_DOMAIN ?? new URL(appOrigin()).hostname;
  const slug = slugFromHost(input.host, root);
  if (slug) {
    return remembered(`slug:${slug}`, () => businessIdForSlug(slug));
  }
  return remembered("default", onlyBusinessId);
}
