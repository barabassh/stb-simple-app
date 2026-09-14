"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import type { ActionFailure, ActionResult } from "@/lib/action-result";
import { diffEntity, logAudit } from "@/lib/audit";
import { authorizedAction } from "@/lib/auth/authorized-action";
import { hashPassword } from "@/lib/auth/password";
import { invalidateAllUserSessions, invalidateSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { getClientInfo } from "@/lib/request-info";
import { describeUserAgent } from "@/lib/user-agent";

import { logUserChanges, USER_AUDIT_SELECT, userAuditSnapshot } from "./audit";
import { createUserSchema, resetPasswordSchema, updateUserSchema, userIdSchema } from "./schemas";

// There is deliberately no delete action: users are only deactivated, so that a login and an
// email always belong to one person in the audit log (docs/ТЗ.md, 4.7).

const USERS_PATH = "/users";

const notFound: ActionFailure = { ok: false, error: "users.errors.notFound" };
const invalidRequest: ActionFailure = { ok: false, error: "users.errors.invalidRequest" };
const lastAdmin: ActionFailure = { ok: false, error: "users.errors.lastAdmin" };
const cannotDeactivateSelf: ActionFailure = {
  ok: false,
  error: "users.errors.cannotDeactivateSelf",
};

function validationFailure(error: z.ZodError): ActionFailure {
  return { ok: false, fieldErrors: z.flattenError(error).fieldErrors };
}

function toProfileData({
  position,
  email,
  phone,
  comment,
  ...rest
}: z.output<typeof updateUserSchema>) {
  return {
    ...rest,
    position: position || null,
    email: email || null,
    phone: phone || null,
    comment: comment || null,
  };
}

/** Called once the input is valid: an invalid request is not worth reading the request for. */
async function auditContext() {
  const [t, request] = await Promise.all([getTranslations(), getClientInfo()]);
  return { t, request };
}

/**
 * Locks the rows of the active administrators until the transaction ends. Without the lock
 * two concurrent requests could each still see another administrator and remove both.
 */
async function lockActiveAdminIds(tx: Prisma.TransactionClient): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "User"
    WHERE role = 'ADMIN' AND "isActive"
    FOR UPDATE`;
  return rows.map((row) => row.id);
}

function isLastActiveAdmin(adminIds: string[], userId: string): boolean {
  return adminIds.length === 1 && adminIds[0] === userId;
}

/**
 * Turns a unique index violation into field errors. The taken values are looked up instead of
 * being read from the error metadata, whose shape depends on the database driver adapter.
 */
async function uniqueViolation(
  error: unknown,
  { login, email, userId }: { login?: string; email: string | null; userId?: string },
): Promise<ActionFailure | null> {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return null;
  }

  const [loginOwner, emailOwner] = await Promise.all([
    login ? db.user.findUnique({ where: { login }, select: { id: true } }) : null,
    email
      ? db.user.findFirst({
          where: { email, ...(userId ? { id: { not: userId } } : {}) },
          select: { id: true },
        })
      : null,
  ]);

  const fieldErrors: Record<string, string[]> = {};
  if (loginOwner) fieldErrors.login = ["users.errors.loginTaken"];
  if (emailOwner) fieldErrors.email = ["users.errors.emailTaken"];

  return Object.keys(fieldErrors).length > 0 ? { ok: false, fieldErrors } : null;
}

export const createUser = authorizedAction(
  "users.create",
  async (actor, input: unknown): Promise<ActionResult<{ id: string }>> => {
    const parsed = createUserSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const { login, password, ...profile } = parsed.data;
    const data = toProfileData(profile);
    const passwordHash = await hashPassword(password);
    const { t, request } = await auditContext();

    try {
      const id = await db.$transaction(async (tx) => {
        const { id, ...created } = await tx.user.create({
          data: { ...data, login, passwordHash, createdById: actor.id, updatedById: actor.id },
          select: { id: true, ...USER_AUDIT_SELECT },
        });
        await logAudit(tx, {
          ...request,
          actor,
          action: "CREATE",
          entity: "User",
          entityId: id,
          summary: t("audit.summaries.userCreated", { login }),
          changes: diffEntity(null, userAuditSnapshot(created, t)),
        });
        return id;
      });

      revalidatePath(USERS_PATH, "layout");
      return { ok: true, id };
    } catch (error) {
      const failure = await uniqueViolation(error, { login, email: data.email });
      if (failure) return failure;
      throw error;
    }
  },
);

/** The role and the status are separate permissions, checked only when the form changes them. */
export const updateUser = authorizedAction(
  "users.update",
  async (actor, id: string, input: unknown): Promise<ActionResult> => {
    if (!userIdSchema.safeParse(id).success) return notFound;
    const parsed = updateUserSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const data = toProfileData(parsed.data);

    if (!data.isActive && id === actor.id) return cannotDeactivateSelf;
    const { t, request } = await auditContext();

    try {
      const result = await db.$transaction(async (tx): Promise<ActionResult> => {
        const adminIds = await lockActiveAdminIds(tx);
        const target = await tx.user.findUnique({ where: { id }, select: USER_AUDIT_SELECT });
        if (!target) return notFound;
        if (data.role !== target.role) requirePermission(actor, "users.changeRole");
        if (data.isActive !== target.isActive) requirePermission(actor, "users.changeStatus");
        if (isLastActiveAdmin(adminIds, id) && (data.role !== "ADMIN" || !data.isActive)) {
          return lastAdmin;
        }

        const changes = diffEntity(
          userAuditSnapshot(target, t),
          userAuditSnapshot({ ...target, ...data }, t),
        );
        // An unchanged form writes nothing, so "Изменено" keeps pointing at the last real change.
        if (changes.length === 0) return { ok: true };

        await tx.user.update({ where: { id }, data: { ...data, updatedById: actor.id } });
        if (target.isActive && !data.isActive) {
          await invalidateAllUserSessions(id, { client: tx });
        }
        await logUserChanges(
          tx,
          { actor, request, t, user: { id, login: target.login, isActive: data.isActive } },
          changes,
        );
        return { ok: true };
      });

      if (result.ok) revalidatePath(USERS_PATH, "layout");
      return result;
    } catch (error) {
      const failure = await uniqueViolation(error, { email: data.email, userId: id });
      if (failure) return failure;
      throw error;
    }
  },
);

export const resetPassword = authorizedAction(
  "users.resetPassword",
  async (actor, id: string, input: unknown): Promise<ActionResult> => {
    if (!userIdSchema.safeParse(id).success) return notFound;
    const target = await db.user.findUnique({ where: { id }, select: { login: true } });
    if (!target) return notFound;

    // The password is compared with the stored login, not with whatever the client sent.
    const parsed = resetPasswordSchema.safeParse({ ...(input as object), login: target.login });
    if (!parsed.success) return validationFailure(parsed.error);

    const passwordHash = await hashPassword(parsed.data.password);
    const { t, request } = await auditContext();
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash, updatedById: actor.id } });
      await invalidateAllUserSessions(id, { client: tx });
      // Only the fact is logged: no value of the password or its hash is written anywhere.
      await logAudit(tx, {
        ...request,
        actor,
        action: "PASSWORD_CHANGE",
        entity: "User",
        entityId: id,
        summary: t("audit.summaries.passwordReset", { login: target.login }),
      });
    });

    revalidatePath(USERS_PATH, "layout");
    return { ok: true };
  },
);

/** Deactivates (`isActive: false`) or activates a user; deactivation ends every session. */
export const toggleStatus = authorizedAction(
  "users.changeStatus",
  async (actor, id: string, isActive: boolean): Promise<ActionResult> => {
    if (!userIdSchema.safeParse(id).success) return notFound;
    if (!z.boolean().safeParse(isActive).success) return invalidRequest;

    if (!isActive && id === actor.id) return cannotDeactivateSelf;
    const { t, request } = await auditContext();

    const result = await db.$transaction(async (tx): Promise<ActionResult> => {
      const adminIds = await lockActiveAdminIds(tx);
      const target = await tx.user.findUnique({ where: { id }, select: USER_AUDIT_SELECT });
      if (!target) return notFound;
      if (target.isActive === isActive) return { ok: true };
      if (!isActive && isLastActiveAdmin(adminIds, id)) return lastAdmin;

      await tx.user.update({ where: { id }, data: { isActive, updatedById: actor.id } });
      if (!isActive) await invalidateAllUserSessions(id, { client: tx });
      await logUserChanges(
        tx,
        { actor, request, t, user: { id, login: target.login, isActive } },
        diffEntity(userAuditSnapshot(target, t), userAuditSnapshot({ ...target, isActive }, t)),
      );
      return { ok: true };
    });

    if (result.ok) revalidatePath(USERS_PATH, "layout");
    return result;
  },
);

export const revokeUserSession = authorizedAction(
  "users.sessions.revoke",
  async (actor, userId: string, sessionId: string): Promise<ActionResult> => {
    if (!userIdSchema.safeParse(userId).success || !z.cuid().safeParse(sessionId).success) {
      return notFound;
    }
    const { t, request } = await auditContext();

    await db.$transaction(async (tx) => {
      const session = await tx.session.findFirst({
        where: { id: sessionId, userId },
        select: { userAgent: true, user: { select: { login: true } } },
      });
      if (!session || !(await invalidateSession(sessionId, { client: tx }))) return;

      // The entry's own browser is the administrator's, so the ended session is named here. Not by
      // its IP address: the summary is also read in the card history by those who may not see it.
      await logAudit(tx, {
        ...request,
        actor,
        action: "SESSION_REVOKE",
        entity: "User",
        entityId: userId,
        summary: t("audit.summaries.sessionRevoked", {
          login: session.user.login,
          browser: describeUserAgent(session.userAgent) ?? t("users.sessions.unknownBrowser"),
        }),
      });
    });

    revalidatePath(`${USERS_PATH}/${userId}`);
    return { ok: true };
  },
);

export const revokeAllUserSessions = authorizedAction(
  "users.sessions.revoke",
  async (actor, userId: string): Promise<ActionResult> => {
    if (!userIdSchema.safeParse(userId).success) return notFound;
    const { t, request } = await auditContext();

    await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { login: true } });
      if (!user || (await invalidateAllUserSessions(userId, { client: tx })) === 0) return;

      await logAudit(tx, {
        ...request,
        actor,
        action: "SESSION_REVOKE",
        entity: "User",
        entityId: userId,
        summary: t("audit.summaries.allSessionsRevoked", { login: user.login }),
      });
    });

    revalidatePath(`${USERS_PATH}/${userId}`);
    return { ok: true };
  },
);
