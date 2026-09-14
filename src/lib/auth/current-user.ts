import { redirect } from "next/navigation";
import { cache } from "react";

import { LOGIN_PATH } from "./constants";
import {
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

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(LOGIN_PATH);
  return user;
}
