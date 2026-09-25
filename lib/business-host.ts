/**
 * What a Host header names: a business by subdomain (`marea.example.com`),
 * or nothing in particular (the bare root domain, or a host this deployment
 * does not recognise), in which case there is a business only if there is
 * exactly one. Pure so it can be tested without a request.
 */
export function slugFromHost(host: string, rootDomain: string): string | null {
  const bare = host.trim().toLowerCase().replace(/:\d+$/, "");
  const root = rootDomain.toLowerCase();
  if (!bare.endsWith(`.${root}`)) return null;
  const label = bare.slice(0, -(root.length + 1));
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label) ? label : null;
}

/**
 * The public origin of one business. With no root domain configured the
 * deployment serves a single origin and that is the answer for everyone
 * (today's behaviour); with one, each business has its own subdomain,
 * keeping APP_ORIGIN's scheme and port.
 */
export function originFor(slug: string, appOrigin: string, rootDomain: string | undefined): string {
  if (!rootDomain) return appOrigin;
  const base = new URL(appOrigin);
  const port = base.port ? `:${base.port}` : "";
  return `${base.protocol}//${slug}.${rootDomain}${port}`;
}

// Names that would be confusing or dangerous as a subdomain: infrastructure a
// deployment may serve on the same domain, and words that read as the platform.
const RESERVED_SLUGS = new Set([
  "www", "admin", "api", "app", "auth", "mail", "smtp", "imap", "ftp", "static", "assets", "cdn", "media",
  "status", "docs", "help", "support", "billing", "dashboard", "login", "signup", "root", "localhost", "test",
]);

/**
 * Why a slug cannot be used, or null when it can. A slug is a business's
 * subdomain, so it is a single lowercase DNS label: letters, digits and inner
 * hyphens, at most 32 characters, and not one of the names reserved above.
 */
export function validateSlug(slug: string): string | null {
  if (!/^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/.test(slug)) {
    return "use 1 to 32 lowercase letters, digits and inner hyphens";
  }
  if (RESERVED_SLUGS.has(slug)) return "that name is reserved";
  return null;
}
