// Kept apart from session.ts: middleware imports these and must not pull in the database client.

export const LOGIN_PATH = "/login";
export const HOME_PATH = "/";
export const CLEAR_SESSION_PATH = "/api/auth/clear-session";

export const SESSION_COOKIE_NAME = "session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_MS / 1000,
} as const;
