import { redirect } from "next/navigation";
import { cache } from "react";

import { can, type Permission } from "@/lib/permissions";

import { CLEAR_SESSION_PATH, FORBIDDEN_PATH, LOGIN_PATH } from "./constants";
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
 * For pages of a section. Checked before any data is read, so that a user without access sees
 * the access denied page rather than an empty list (docs/ПРАВА-ДОСТУПА.md, 3.4).
 */
export async function requirePagePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, permission)) redirect(FORBIDDEN_PATH);
  return user;
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
