"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import type { ActionFailure, ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth/current-user";
import { hashPassword } from "@/lib/auth/password";
import { invalidateAllUserSessions, invalidateSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

import { notDeleted } from "./queries";
import { createUserSchema, resetPasswordSchema, updateUserSchema, userIdSchema } from "./schemas";

const USERS_PATH = "/users";

// A deleted account keeps its row for the audit log, but its login becomes free again
// (docs/ТЗ.md, 4.7). "#" is not allowed in a login, so the renamed value cannot clash.
const DELETED_LOGIN_MARK = "#deleted#";

const notFound: ActionFailure = { ok: false, error: "users.errors.notFound" };
const invalidRequest: ActionFailure = { ok: false, error: "users.errors.invalidRequest" };
const lastAdmin: ActionFailure = { ok: false, error: "users.errors.lastAdmin" };
const cannotBlockSelf: ActionFailure = { ok: false, error: "users.errors.cannotBlockSelf" };
const cannotDeleteSelf: ActionFailure = { ok: false, error: "users.errors.cannotDeleteSelf" };

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

/**
 * Locks the rows of the active administrators until the transaction ends. Without the lock
 * two concurrent requests could each still see another administrator and remove both.
 */
async function lockActiveAdminIds(tx: Prisma.TransactionClient): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "User"
    WHERE role = 'ADMIN' AND "isActive" AND "deletedAt" IS NULL
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

export async function createUser(input: unknown): Promise<ActionResult<{ id: string }>> {
  const actor = await requireUser();

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const { login, password, ...profile } = parsed.data;
  const data = toProfileData(profile);

  try {
    const { id } = await db.user.create({
      data: {
        ...data,
        login,
        passwordHash: await hashPassword(password),
        createdById: actor.id,
        updatedById: actor.id,
      },
      select: { id: true },
    });

    revalidatePath(USERS_PATH, "layout");
    return { ok: true, id };
  } catch (error) {
    const failure = await uniqueViolation(error, { login, email: data.email });
    if (failure) return failure;
    throw error;
  }
}

export async function updateUser(id: string, input: unknown): Promise<ActionResult> {
  const actor = await requireUser();

  if (!userIdSchema.safeParse(id).success) return notFound;
  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const data = toProfileData(parsed.data);

  if (!data.isActive && id === actor.id) return cannotBlockSelf;

  try {
    const result = await db.$transaction(async (tx): Promise<ActionResult> => {
      const adminIds = await lockActiveAdminIds(tx);
      const target = await tx.user.findFirst({
        where: { id, ...notDeleted },
        select: { isActive: true },
      });
      if (!target) return notFound;
      if (isLastActiveAdmin(adminIds, id) && (data.role !== "ADMIN" || !data.isActive)) {
        return lastAdmin;
      }

      await tx.user.update({ where: { id }, data: { ...data, updatedById: actor.id } });
      if (target.isActive && !data.isActive) {
        await invalidateAllUserSessions(id, { client: tx });
      }
      return { ok: true };
    });

    if (result.ok) revalidatePath(USERS_PATH, "layout");
    return result;
  } catch (error) {
    const failure = await uniqueViolation(error, { email: data.email, userId: id });
    if (failure) return failure;
    throw error;
  }
}

export async function resetPassword(id: string, input: unknown): Promise<ActionResult> {
  const actor = await requireUser();

  if (!userIdSchema.safeParse(id).success) return notFound;
  const target = await db.user.findFirst({
    where: { id, ...notDeleted },
    select: { login: true },
  });
  if (!target) return notFound;

  // The password is compared with the stored login, not with whatever the client sent.
  const parsed = resetPasswordSchema.safeParse({ ...(input as object), login: target.login });
  if (!parsed.success) return validationFailure(parsed.error);

  const passwordHash = await hashPassword(parsed.data.password);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { passwordHash, updatedById: actor.id } });
    await invalidateAllUserSessions(id, { client: tx });
  });

  revalidatePath(USERS_PATH, "layout");
  return { ok: true };
}

export async function toggleStatus(id: string, isActive: boolean): Promise<ActionResult> {
  const actor = await requireUser();

  if (!userIdSchema.safeParse(id).success) return notFound;
  if (!z.boolean().safeParse(isActive).success) return invalidRequest;

  if (!isActive && id === actor.id) return cannotBlockSelf;

  const result = await db.$transaction(async (tx): Promise<ActionResult> => {
    const adminIds = await lockActiveAdminIds(tx);
    const target = await tx.user.findFirst({
      where: { id, ...notDeleted },
      select: { isActive: true },
    });
    if (!target) return notFound;
    if (target.isActive === isActive) return { ok: true };
    if (!isActive && isLastActiveAdmin(adminIds, id)) return lastAdmin;

    await tx.user.update({ where: { id }, data: { isActive, updatedById: actor.id } });
    if (!isActive) await invalidateAllUserSessions(id, { client: tx });
    return { ok: true };
  });

  if (result.ok) revalidatePath(USERS_PATH, "layout");
  return result;
}

export async function deleteUser(id: string): Promise<ActionResult> {
  const actor = await requireUser();

  if (!userIdSchema.safeParse(id).success) return notFound;
  if (id === actor.id) return cannotDeleteSelf;

  const result = await db.$transaction(async (tx): Promise<ActionResult> => {
    const adminIds = await lockActiveAdminIds(tx);
    const target = await tx.user.findFirst({
      where: { id, ...notDeleted },
      select: { login: true },
    });
    if (!target) return notFound;
    if (isLastActiveAdmin(adminIds, id)) return lastAdmin;

    const deletedAt = new Date();
    await tx.user.update({
      where: { id },
      data: {
        deletedAt,
        login: `${target.login}${DELETED_LOGIN_MARK}${deletedAt.getTime()}`,
        updatedById: actor.id,
      },
    });
    await invalidateAllUserSessions(id, { client: tx });
    return { ok: true };
  });

  if (result.ok) revalidatePath(USERS_PATH, "layout");
  return result;
}

export async function revokeUserSession(userId: string, sessionId: string): Promise<ActionResult> {
  await requireUser();

  if (!userIdSchema.safeParse(userId).success || !z.cuid().safeParse(sessionId).success) {
    return notFound;
  }

  await invalidateSession(sessionId);
  revalidatePath(`${USERS_PATH}/${userId}`);
  return { ok: true };
}

export async function revokeAllUserSessions(userId: string): Promise<ActionResult> {
  await requireUser();

  if (!userIdSchema.safeParse(userId).success) return notFound;

  await invalidateAllUserSessions(userId);
  revalidatePath(`${USERS_PATH}/${userId}`);
  return { ok: true };
}
