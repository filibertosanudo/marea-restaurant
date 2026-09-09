import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { CSP_NONCE_HEADER, buildCsp, generateCspNonce } from "@/lib/security/csp";

const LOGIN_PATH = "/admin/login";
const CHANGE_PASSWORD_PATH = "/admin/change-password";
const STAFF_HOME = "/admin/menu";
// Reachable with no session, on purpose: a forgotten password is exactly
// the case where requiring one would lock someone out for good.
const FORGOT_PASSWORD_PATH = "/admin/forgot-password";
const RESET_PASSWORD_PREFIX = "/admin/reset-password/";

// Every response carries the CSP, keyed to a nonce generated fresh per
// request — layout.tsx reads it back via headers() to stamp the inline
// theme script, which is the only reason 'unsafe-inline' isn't needed for
// script-src.
function withSecurityHeaders(response: NextResponse, nonce: string): NextResponse {
  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  return response;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const nonce = generateCspNonce();

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(CSP_NONCE_HEADER, nonce);

  if (!pathname.startsWith("/admin")) {
    return withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), nonce);
  }

  if (pathname === FORGOT_PASSWORD_PATH || pathname.startsWith(RESET_PASSWORD_PREFIX)) {
    return withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), nonce);
  }

  const session = req.auth;
  const isLoggedIn = !!session?.user && !session.user.revoked;

  if (pathname === LOGIN_PATH) {
    if (isLoggedIn) {
      return withSecurityHeaders(NextResponse.redirect(new URL("/admin", req.nextUrl)), nonce);
    }
    return withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), nonce);
  }

  if (!isLoggedIn) {
    return withSecurityHeaders(NextResponse.redirect(new URL(LOGIN_PATH, req.nextUrl)), nonce);
  }

  if (session.user.mustChangePassword) {
    if (pathname !== CHANGE_PASSWORD_PATH) {
      return withSecurityHeaders(NextResponse.redirect(new URL(CHANGE_PASSWORD_PATH, req.nextUrl)), nonce);
    }
    return withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), nonce);
  }

  if (pathname === CHANGE_PASSWORD_PATH) {
    return withSecurityHeaders(NextResponse.redirect(new URL("/admin", req.nextUrl)), nonce);
  }

  if (session.user.role === "STAFF" && pathname === "/admin") {
    return withSecurityHeaders(NextResponse.redirect(new URL(STAFF_HOME, req.nextUrl)), nonce);
  }

  return withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), nonce);
});

export const config = {
  // Runs on every route (not just /admin) so the CSP nonce and security
  // headers cover the public menu, cart, and checkout flow too — only
  // Next's own static assets are excluded.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
