import { NextResponse, type NextRequest } from "next/server";

import {
  CLEAR_SESSION_PATH,
  LOGIN_PATH,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/auth/constants";

const PUBLIC_PATHS = new Set([LOGIN_PATH]);

// Only the presence of the cookie is checked here, without the database:
// requireUser() validates the session itself on the server.
export function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    if (PUBLIC_PATHS.has(request.nextUrl.pathname)) return NextResponse.next();
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }

  const response = NextResponse.next();
  // Server Components cannot set cookies, so the sliding cookie lifetime is renewed here;
  // expiry of the session record in the database remains the authority.
  // Not where the cookie is being deleted: the renewal would reach the browser in the same response.
  if (request.method === "GET" && request.nextUrl.pathname !== CLEAR_SESSION_PATH) {
    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
