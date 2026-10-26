import { isCertificateAllowed } from "@/lib/tls/allowed";

/**
 * Asked by Caddy before it requests a certificate (docker/Caddyfile,
 * on_demand_tls): 200 for a name this deployment serves, 404 for any other.
 * No secret: it answers what the public site already shows, whether a
 * business answers at that address.
 */
export async function GET(request: Request) {
  const domain = new URL(request.url).searchParams.get("domain") ?? "";
  const allowed = domain !== "" && (await isCertificateAllowed(domain));
  return new Response(allowed ? "ok" : "not served here", { status: allowed ? 200 : 404 });
}
