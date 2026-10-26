import "server-only";
import { env } from "@/lib/env";
import { slugFromHost } from "@/lib/business-host";
import { businessIdForSlug } from "@/lib/tenancy/discover";

/**
 * Whether the reverse proxy may obtain a TLS certificate for `domain`
 * (Caddy's on-demand TLS "ask", docker/Caddyfile). Only the deployment's own
 * root domain and the subdomain of a business that exists: otherwise anyone
 * could point arbitrary names at the server and spend its certificate
 * authority's rate limit, one name at a time.
 */
export async function isCertificateAllowed(domain: string): Promise<boolean> {
  const root = env.BUSINESS_ROOT_DOMAIN?.toLowerCase();
  if (!root) return false;
  const name = domain.trim().toLowerCase();
  if (name === root) return true;
  const slug = slugFromHost(name, root);
  return slug !== null && (await businessIdForSlug(slug)) !== null;
}
