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
