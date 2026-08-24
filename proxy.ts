import { NextResponse } from "next/server";
import { auth } from "@/auth";

const LOGIN_PATH = "/admin/login";
const CHANGE_PASSWORD_PATH = "/admin/change-password";
const STAFF_HOME = "/admin/menu";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/admin")) return;

  const session = req.auth;
  const isLoggedIn = !!session?.user && !session.user.revoked;

  if (pathname === LOGIN_PATH) {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL("/admin", req.nextUrl));
    }
    return;
  }

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL(LOGIN_PATH, req.nextUrl));
  }

  if (session.user.mustChangePassword) {
    if (pathname !== CHANGE_PASSWORD_PATH) {
      return NextResponse.redirect(new URL(CHANGE_PASSWORD_PATH, req.nextUrl));
    }
    return;
  }

  if (pathname === CHANGE_PASSWORD_PATH) {
    return NextResponse.redirect(new URL("/admin", req.nextUrl));
  }

  if (session.user.role === "STAFF" && pathname === "/admin") {
    return NextResponse.redirect(new URL(STAFF_HOME, req.nextUrl));
  }
});

export const config = {
  matcher: ["/admin/:path*"],
};
