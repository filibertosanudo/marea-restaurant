import "server-only";
import { randomBytes } from "crypto";
import { allowedImageHosts } from "@/lib/env";

export const CSP_NONCE_HEADER = "x-csp-nonce";

export function generateCspNonce(): string {
  return randomBytes(16).toString("base64");
}

/**
 * Stripe Elements needs its own iframe (3D Secure, card fields) and talks
 * to api.stripe.com directly from the browser — none of that traffic goes
 * through this app's server, so it has to be named here explicitly or the
 * payment and 3DS challenge silently fail with no visible error.
 */
export function buildCsp(nonce: string): string {
  const imageHosts = Array.from(allowedImageHosts())
    .map((host) => `https://${host}`)
    .join(" ");

  // Next's dev server (Turbopack HMR, React Refresh) calls eval() for
  // stack-frame reconstruction — never shipped, so scoped strictly to
  // non-production instead of weakening the policy that ships.
  const devEval = process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";

  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}'${devEval} https://js.stripe.com`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: ${imageHosts}`.trim(),
    `font-src 'self' data:`,
    `connect-src 'self' https://api.stripe.com`,
    `frame-src 'self' https://js.stripe.com https://hooks.stripe.com`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ];

  return directives.join("; ");
}
