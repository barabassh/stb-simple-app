import { redirect } from "next/navigation";
import { cache } from "react";

import { CLEAR_SESSION_PATH, LOGIN_PATH } from "./constants";
import {
  deleteSessionCookie,
  readSessionCookie,
  validateSession,
  type SessionUser,
  type ValidatedSession,
} from "./session";

export const getCurrentSession = cache(async (): Promise<ValidatedSession | null> => {
  const token = await readSessionCookie();
  return token ? validateSession(token) : null;
});

export async function getCurrentUser(): Promise<SessionUser | null> {
  return (await getCurrentSession())?.user ?? null;
}

/**
 * For pages and layouts. They cannot modify cookies, so a cookie that outlived its session is
 * removed by a route handler; left in place, it would be validated again on every request.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (user) return user;
  redirect((await readSessionCookie()) ? CLEAR_SESSION_PATH : LOGIN_PATH);
}

/**
 * For server actions. Next.js renders the target of an action's redirect on the server and
 * passes on only the final response, so a cookie removed by the route handler would stay.
 */
export async function requireActionUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (user) return user;
  await deleteSessionCookie();
  redirect(LOGIN_PATH);
}
