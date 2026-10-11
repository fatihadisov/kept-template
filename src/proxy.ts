import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, authMode, checkSession, sessionCookieOptions, signSession } from "@/lib/session-token";

/**
 * Sends anyone without a valid session to /login before a page is even rendered. (The data layer checks
 * the session again on its own, see src/server/auth.ts: this is the quick front door, not the only lock.)
 *
 * Runs only when the app is password-protected (hosted, or APP_PASSWORD set); plain local use passes through.
 */
export function proxy(request: NextRequest) {
  const mode = authMode();
  if (mode.kind === "off") return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next(); // the login page explains a bad setup itself

  const signedIn = mode.kind === "on" ? checkSession(mode.key, request.cookies.get(SESSION_COOKIE)?.value) : ({ ok: false } as const);

  if (signedIn.ok && mode.kind === "on") {
    const response = NextResponse.next();
    if (signedIn.refresh) {
      const secure = request.headers.get("x-forwarded-proto") === "https" || request.nextUrl.protocol === "https:";
      response.cookies.set(SESSION_COOKIE, signSession(mode.key), sessionCookieOptions(secure));
    }
    return response;
  }

  // Opening a page or a download link: go sign in, then come back here.
  if (request.method === "GET" || request.method === "HEAD") {
    const to = new URL("/login", request.url);
    if (pathname !== "/") to.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(to);
  }
  // Anything else (a form or action sent without a session): refuse.
  return new NextResponse("Please sign in again.", { status: 401 });
}

export const config = {
  // everything except the build's own static files, the app icons and the home-screen manifest
  // (the phone asks for those without a cookie, and they hold nothing private)
  matcher: ["/((?!_next/static|_next/image|icon.svg|apple-icon.png|icons/|manifest.webmanifest|favicon.ico|robots.txt).*)"],
};
