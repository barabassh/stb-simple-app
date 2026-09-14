import { createHash, randomBytes } from "node:crypto";

import { cookies } from "next/headers";

import type { Role } from "@/generated/prisma/client";
import { db } from "@/lib/db";

import { SESSION_COOKIE_NAME, SESSION_TTL_MS, sessionCookieOptions } from "./constants";

// Throttles the extension write so that ordinary navigation does not update the row on every request.
const SESSION_EXTEND_AFTER_MS = 60 * 60 * 1000;

export type SessionUser = {
  id: string;
  login: string;
  fullName: string;
  role: Role;
};

export type ValidatedSession = {
  session: { id: string; expiresAt: Date };
  user: SessionUser;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Stores only the SHA-256 of the token and returns the token itself for the cookie. */
export async function createSession(
  userId: string,
  ip: string | null,
  userAgent: string | null,
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();

  await db.session.deleteMany({ where: { userId, expiresAt: { lt: new Date(now) } } });
  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(now + SESSION_TTL_MS),
      ip,
      userAgent,
    },
  });

  return token;
}

export async function validateSession(token: string): Promise<ValidatedSession | null> {
  const record = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      lastActiveAt: true,
      revokedAt: true,
      user: {
        select: {
          id: true,
          login: true,
          fullName: true,
          role: true,
          isActive: true,
          deletedAt: true,
        },
      },
    },
  });

  const now = Date.now();
  if (!record || record.revokedAt || record.expiresAt.getTime() <= now) return null;

  const { isActive, deletedAt, ...user } = record.user;
  // Blocking and deletion revoke sessions as well; this also covers a revoke that raced with them.
  if (!isActive || deletedAt) return null;

  let { expiresAt } = record;
  if (now - record.lastActiveAt.getTime() > SESSION_EXTEND_AFTER_MS) {
    expiresAt = new Date(now + SESSION_TTL_MS);
    await db.session.update({
      where: { id: record.id },
      data: { lastActiveAt: new Date(now), expiresAt },
    });
  }

  return { session: { id: record.id, expiresAt }, user };
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await db.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function invalidateAllUserSessions(
  userId: string,
  { exceptSessionId }: { exceptSessionId?: string } = {},
): Promise<void> {
  await db.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
    data: { revokedAt: new Date() },
  });
}

export async function readSessionCookie(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE_NAME, token, sessionCookieOptions);
}

export async function deleteSessionCookie(): Promise<void> {
  // cookies().delete(name) omits the path, so from a nested route it would miss the cookie set on "/".
  (await cookies()).set(SESSION_COOKIE_NAME, "", { ...sessionCookieOptions, maxAge: 0 });
}
