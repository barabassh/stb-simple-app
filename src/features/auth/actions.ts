"use server";

import { randomBytes } from "node:crypto";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import type { ActionFailure } from "@/lib/action-result";
import { logAudit, type AuditEntry } from "@/lib/audit";
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
const LOGIN_LOCK_MINUTES = 15;
const LOGIN_LOCK_MS = LOGIN_LOCK_MINUTES * 60 * 1000;

// The sign-in form accepts any text; a longer value is not a login and is not worth storing whole.
const MAX_LOGGED_LOGIN_LENGTH = 64;

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
  const [t, request] = await Promise.all([getTranslations("audit.summaries"), getClientInfo()]);

  // The reason is shown only in the log: the form gives one text for all of them.
  const failedAttempt = (summary: string): AuditEntry => ({
    ...request,
    actor: { id: null, login: login.slice(0, MAX_LOGGED_LOGIN_LENGTH) },
    action: "LOGIN_FAILED",
    entity: "Session",
    summary,
  });

  const user = await db.user.findUnique({
    where: { login },
    select: {
      id: true,
      passwordHash: true,
      isActive: true,
      lockedUntil: true,
      updatedAt: true,
    },
  });

  if (!user || !user.isActive) {
    await verifyAgainstDummyHash(password);
    await logAudit(db, failedAttempt(t(user ? "loginFailedInactive" : "loginFailedUnknown")));
    return invalidCredentials;
  }

  const now = Date.now();
  if (user.lockedUntil && user.lockedUntil.getTime() > now) {
    await logAudit(db, failedAttempt(t("loginFailedLocked")));
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
    await db.$transaction(async (tx) => {
      // The increment is done in the database: parallel guesses must not all read the same counter.
      const { failedLoginCount } = await tx.user.update({
        where: { id: user.id },
        data: { failedLoginCount: { increment: 1 }, updatedAt },
        select: { failedLoginCount: true },
      });
      const locked = failedLoginCount >= MAX_FAILED_LOGINS;
      if (locked) {
        await tx.user.update({
          where: { id: user.id },
          data: { failedLoginCount: 0, lockedUntil: new Date(now + LOGIN_LOCK_MS), updatedAt },
        });
      }
      await logAudit(
        tx,
        failedAttempt(
          locked ? t("loginLocked", { minutes: LOGIN_LOCK_MINUTES }) : t("loginFailedPassword"),
        ),
      );
    });
    return invalidCredentials;
  }

  const token = await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(now), updatedAt },
    });
    const session = await createSession(user.id, request.ip, request.userAgent, { client: tx });
    await logAudit(tx, {
      ...request,
      actor: { id: user.id, login },
      action: "LOGIN",
      entity: "Session",
      entityId: session.id,
      summary: t("login"),
    });
    return session.token;
  });

  await setSessionCookie(token);
  redirect(HOME_PATH);
}

export async function signOut(): Promise<void> {
  const current = await getCurrentSession();
  if (current) {
    const [t, request] = await Promise.all([getTranslations("audit.summaries"), getClientInfo()]);
    await db.$transaction(async (tx) => {
      if (!(await invalidateSession(current.session.id, { client: tx }))) return;
      await logAudit(tx, {
        ...request,
        actor: current.user,
        action: "LOGOUT",
        entity: "Session",
        entityId: current.session.id,
        summary: t("logout"),
      });
    });
  }

  await deleteSessionCookie();
  redirect(LOGIN_PATH);
}
