"use server";

import { randomBytes } from "node:crypto";

import { redirect } from "next/navigation";
import { z } from "zod";

import type { ActionFailure } from "@/lib/action-result";
import { HOME_PATH, LOGIN_PATH } from "@/lib/auth/constants";
import { getCurrentSession } from "@/lib/auth/current-user";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  createSession,
  deleteSessionCookie,
  invalidateSession,
  setSessionCookie,
} from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getClientInfo } from "@/lib/request-info";

import { loginSchema } from "./schemas";

const MAX_FAILED_LOGINS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

const invalidCredentials: ActionFailure = { ok: false, error: "auth.errors.invalidCredentials" };

let dummyPasswordHash: Promise<string> | undefined;

// An unknown login is checked against a throwaway hash so that it takes as long
// as a wrong password: response time must not reveal which logins exist.
async function verifyAgainstDummyHash(password: string): Promise<void> {
  dummyPasswordHash ??= hashPassword(randomBytes(16).toString("hex"));
  await verifyPassword(await dummyPasswordHash, password);
}

export async function signIn(input: unknown): Promise<ActionFailure> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const { login, password } = parsed.data;

  const user = await db.user.findUnique({
    where: { login },
    select: {
      id: true,
      passwordHash: true,
      isActive: true,
      deletedAt: true,
      lockedUntil: true,
      updatedAt: true,
    },
  });

  if (!user || !user.isActive || user.deletedAt) {
    await verifyAgainstDummyHash(password);
    return invalidCredentials;
  }

  const now = Date.now();
  if (user.lockedUntil && user.lockedUntil.getTime() > now) {
    return {
      ok: false,
      error: "auth.errors.temporarilyLocked",
      errorValues: { minutes: Math.ceil((user.lockedUntil.getTime() - now) / 60_000) },
    };
  }

  // Login bookkeeping is not an edit of the account: updatedAt is written back unchanged
  // so the "Изменено" mark keeps pointing at the last real change and its author.
  const { updatedAt } = user;

  if (!(await verifyPassword(user.passwordHash, password))) {
    // The increment is done in the database: parallel guesses must not all read the same counter.
    const { failedLoginCount } = await db.user.update({
      where: { id: user.id },
      data: { failedLoginCount: { increment: 1 }, updatedAt },
      select: { failedLoginCount: true },
    });
    if (failedLoginCount >= MAX_FAILED_LOGINS) {
      await db.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: new Date(now + LOGIN_LOCK_MS), updatedAt },
      });
    }
    return invalidCredentials;
  }

  await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(now), updatedAt },
  });

  const { ip, userAgent } = await getClientInfo();
  await setSessionCookie(await createSession(user.id, ip, userAgent));

  redirect(HOME_PATH);
}

export async function signOut(): Promise<void> {
  const current = await getCurrentSession();
  if (current) await invalidateSession(current.session.id);

  await deleteSessionCookie();
  redirect(LOGIN_PATH);
}
