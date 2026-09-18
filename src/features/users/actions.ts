"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import type { ActionFailure, ActionResult } from "@/lib/action-result";
import { diffEntity, logAudit } from "@/lib/audit";
import { authorizedAction } from "@/lib/auth/authorized-action";
import { hashPassword } from "@/lib/auth/password";
import { invalidateAllUserSessions, invalidateSession, type SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requirePermission, userUpdatePermission } from "@/lib/permissions";
import { getClientInfo } from "@/lib/request-info";
import { describeUserAgent } from "@/lib/user-agent";

import { logUserChanges, USER_AUDIT_SELECT, userAuditSnapshot } from "./audit";
import {
  contractorLinkSchema,
  createUserSchema,
  profileSchema,
  resetPasswordSchema,
  updateUserSchema,
  userIdSchema,
} from "./schemas";

// There is deliberately no delete action: users are only deactivated, so that a login and an
// email always belong to one person in the audit log (docs/ТЗ.md, 4.7).

const USERS_PATH = "/users";
const PROFILE_PATH = "/profile";

const notFound: ActionFailure = { ok: false, error: "users.errors.notFound" };
const invalidRequest: ActionFailure = { ok: false, error: "errors.invalidRequest" };
const lastAdmin: ActionFailure = { ok: false, error: "users.errors.lastAdmin" };
const cannotDeactivateSelf: ActionFailure = {
  ok: false,
  error: "users.errors.cannotDeactivateSelf",
};
const contractorInvalid: ActionFailure = {
  ok: false,
  fieldErrors: { contractorId: ["users.validation.contractorInvalid"] },
};
const contractorArchived: ActionFailure = {
  ok: false,
  fieldErrors: { contractorId: ["users.validation.contractorArchived"] },
};

/** The field errors of every schema the input failed, each message once. */
function validationFailure(...errors: (z.ZodError | undefined)[]): ActionFailure {
  const fieldErrors: Record<string, string[]> = {};
  for (const error of errors) {
    if (!error) continue;
    const flattened: Record<string, string[] | undefined> = z.flattenError(error).fieldErrors;
    for (const [field, messages = []] of Object.entries(flattened)) {
      fieldErrors[field] = [...new Set([...(fieldErrors[field] ?? []), ...messages])];
    }
  }
  return { ok: false, fieldErrors };
}

/**
 * The organisation part of the account form (docs/ТЗ.md, 6.5). The field is sent only by the form
 * of those who may link an account, so sending it without users.changeContractor is refused like
 * a role change (docs/ПРАВА-ДОСТУПА.md, 14). `requested` is undefined when it was not sent: the
 * current link stays unless the role changes.
 */
function parseContractorLink(actor: SessionUser, input: unknown) {
  const sent =
    typeof input === "object" && input !== null && "contractorId" in input
      ? input.contractorId !== undefined
      : false;
  if (!sent) return { requested: undefined, error: undefined };

  requirePermission(actor, "users.changeContractor");
  const parsed = contractorLinkSchema.safeParse(input);
  return parsed.success
    ? { requested: parsed.data.contractorId || null, error: undefined }
    : { requested: undefined, error: parsed.error };
}

type ContractorLink = { contractorId: string | null; contractor: { name: string } | null };

/**
 * The contractor the saved account is linked to. Only a contractor account has one, so another
 * role clears it. A newly chosen contractor must be active; an archived one the account is already
 * linked to stays (docs/ПРАВА-ДОСТУПА.md, 13).
 */
async function resolveContractorLink(
  tx: Prisma.TransactionClient,
  role: Role,
  requested: string | null | undefined,
  current: ContractorLink,
): Promise<ContractorLink | ActionFailure> {
  const kept = requested === undefined ? current.contractorId : requested;
  const contractorId = role === "CONTRACTOR" ? kept : null;
  if (contractorId === current.contractorId) {
    return { contractorId, contractor: current.contractor };
  }
  if (contractorId === null) return { contractorId: null, contractor: null };

  const contractor = await tx.contractor.findUnique({
    where: { id: contractorId },
    select: { name: true, isActive: true },
  });
  if (!contractor) return contractorInvalid;
  if (!contractor.isActive) return contractorArchived;
  return { contractorId, contractor: { name: contractor.name } };
}

const isFailure = (value: ContractorLink | ActionFailure): value is ActionFailure => "ok" in value;

function toProfileData<T extends z.output<typeof profileSchema>>({
  position,
  email,
  phone,
  ...rest
}: T) {
  return { ...rest, position: position || null, email: email || null, phone: phone || null };
}

function toAccountData({ comment, ...profile }: z.output<typeof updateUserSchema>) {
  return { ...toProfileData(profile), comment: comment || null };
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
    const link = parseContractorLink(actor, input);
    const parsed = createUserSchema.safeParse(input);
    if (!parsed.success || link.error) return validationFailure(parsed.error, link.error);
    const { login, password, ...account } = parsed.data;
    const data = toAccountData(account);
    const passwordHash = await hashPassword(password);
    const { t, request } = await auditContext();

    try {
      const result = await db.$transaction(async (tx): Promise<ActionResult<{ id: string }>> => {
        const contractor = await resolveContractorLink(tx, data.role, link.requested, {
          contractorId: null,
          contractor: null,
        });
        if (isFailure(contractor)) return contractor;

        const { id, ...created } = await tx.user.create({
          data: {
            ...data,
            contractorId: contractor.contractorId,
            login,
            passwordHash,
            createdById: actor.id,
            updatedById: actor.id,
          },
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
        return { ok: true, id };
      });

      if (result.ok) revalidatePath(USERS_PATH, "layout");
      return result;
    } catch (error) {
      const failure = await uniqueViolation(error, { login, email: data.email });
      if (failure) return failure;
      throw error;
    }
  },
);

/**
 * A manager edits the profile of a user who is not an administrator. The role, the status and
 * the comment are separate permissions, checked only when the form changes them.
 */
export const updateUser = authorizedAction(
  "users.updateProfile",
  async (actor, id: string, input: unknown): Promise<ActionResult> => {
    if (!userIdSchema.safeParse(id).success) return notFound;
    const link = parseContractorLink(actor, input);
    const parsed = updateUserSchema.safeParse(input);
    if (!parsed.success || link.error) return validationFailure(parsed.error, link.error);
    const data = toAccountData(parsed.data);

    if (!data.isActive && id === actor.id) return cannotDeactivateSelf;
    const { t, request } = await auditContext();

    try {
      const result = await db.$transaction(async (tx): Promise<ActionResult> => {
        const adminIds = await lockActiveAdminIds(tx);
        const target = await tx.user.findUnique({ where: { id }, select: USER_AUDIT_SELECT });
        if (!target) return notFound;
        requirePermission(actor, userUpdatePermission(target));
        if (data.role !== target.role) requirePermission(actor, "users.changeRole");
        if (data.isActive !== target.isActive) requirePermission(actor, "users.changeStatus");
        if (data.comment !== target.comment) requirePermission(actor, "users.update");
        if (isLastActiveAdmin(adminIds, id) && (data.role !== "ADMIN" || !data.isActive)) {
          return lastAdmin;
        }
        const contractor = await resolveContractorLink(tx, data.role, link.requested, target);
        if (isFailure(contractor)) return contractor;

        const changes = diffEntity(
          userAuditSnapshot(target, t),
          userAuditSnapshot({ ...target, ...data, ...contractor }, t),
        );
        // An unchanged form writes nothing, so "Изменено" keeps pointing at the last real change.
        if (changes.length === 0) return { ok: true };

        await tx.user.update({
          where: { id },
          data: { ...data, contractorId: contractor.contractorId, updatedById: actor.id },
        });
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

export const updateOwnProfile = authorizedAction(
  "profile.update",
  async (actor, input: unknown): Promise<ActionResult> => {
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const data = toProfileData(parsed.data);
    const { t, request } = await auditContext();

    try {
      await db.$transaction(async (tx) => {
        const target = await tx.user.findUniqueOrThrow({
          where: { id: actor.id },
          select: USER_AUDIT_SELECT,
        });
        const changes = diffEntity(
          userAuditSnapshot(target, t),
          userAuditSnapshot({ ...target, ...data }, t),
        );
        if (changes.length === 0) return;

        await tx.user.update({ where: { id: actor.id }, data: { ...data, updatedById: actor.id } });
        await logUserChanges(
          tx,
          { actor, request, t, user: { id: actor.id, login: target.login, isActive: true } },
          changes,
        );
      });
    } catch (error) {
      const failure = await uniqueViolation(error, { email: data.email, userId: actor.id });
      if (failure) return failure;
      throw error;
    }

    // The full name is also shown in the header of every page.
    revalidatePath("/", "layout");
    return { ok: true };
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

/** The current session is not ended here: that is signing out, logged as LOGOUT. */
export const revokeOwnSession = authorizedAction(
  "profile.sessions",
  async (actor, sessionId: string): Promise<ActionResult> => {
    if (!z.cuid().safeParse(sessionId).success || sessionId === actor.sessionId) {
      return invalidRequest;
    }
    const { t, request } = await auditContext();

    await db.$transaction(async (tx) => {
      const session = await tx.session.findFirst({
        where: { id: sessionId, userId: actor.id },
        select: { userAgent: true },
      });
      if (!session || !(await invalidateSession(sessionId, { client: tx }))) return;

      await logAudit(tx, {
        ...request,
        actor,
        action: "SESSION_REVOKE",
        entity: "User",
        entityId: actor.id,
        summary: t("audit.summaries.sessionRevoked", {
          login: actor.login,
          browser: describeUserAgent(session.userAgent) ?? t("users.sessions.unknownBrowser"),
        }),
      });
    });

    revalidatePath(PROFILE_PATH);
    return { ok: true };
  },
);

export const revokeOtherOwnSessions = authorizedAction(
  "profile.sessions",
  async (actor): Promise<ActionResult> => {
    const { t, request } = await auditContext();

    await db.$transaction(async (tx) => {
      const revoked = await invalidateAllUserSessions(actor.id, {
        exceptSessionId: actor.sessionId,
        client: tx,
      });
      if (revoked === 0) return;

      await logAudit(tx, {
        ...request,
        actor,
        action: "SESSION_REVOKE",
        entity: "User",
        entityId: actor.id,
        summary: t("audit.summaries.otherSessionsRevoked", { login: actor.login }),
      });
    });

    revalidatePath(PROFILE_PATH);
    return { ok: true };
  },
);
