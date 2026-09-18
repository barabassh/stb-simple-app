import { beforeEach, describe, expect, it } from "vitest";

import {
  createUser as createUserAction,
  resetPassword,
  revokeAllUserSessions,
  revokeOwnSession,
  revokeUserSession,
  toggleStatus,
  updateOwnProfile,
  updateUser,
} from "@/features/users/actions";
import type { Role } from "@/generated/prisma/enums";
import { createSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

import { actAs, auditEntries, createUser, editFormOf, type TestUser } from "./helpers";

const refused = { ok: false, error: "errors.forbiddenAction" };

const NEW_USER = {
  login: "sidorov",
  password: "Secret2026new",
  fullName: "Сидоров Сидор",
  nickname: "Сидор",
  nicknameEdited: false,
  position: "",
  email: "",
  phone: "",
  role: "EMPLOYEE",
  isActive: true,
  comment: "",
};

/** Everything a refused action could have changed. */
async function databaseState() {
  const [users, sessions, entries] = await Promise.all([
    db.user.findMany({ orderBy: { login: "asc" } }),
    db.session.findMany({ orderBy: { id: "asc" } }),
    db.auditLog.count(),
  ]);
  return { users, sessions, entries };
}

async function expectRefusedWithoutChanges(action: () => Promise<unknown>) {
  const before = await databaseState();
  await expect(action()).resolves.toEqual(refused);
  expect(await databaseState()).toEqual(before);
}

describe.each<Role>(["MANAGER", "EMPLOYEE", "CONTRACTOR"])("%s", (role) => {
  let target: TestUser;
  let targetSessionId: string;

  beforeEach(async () => {
    target = await createUser({ login: "petrov" });
    ({ id: targetSessionId } = await createSession(target.id, null, null));
    await actAs(await createUser({ login: "actor", role }));
  });

  it.each([
    ["create a user", () => createUserAction(NEW_USER)],
    ["reset a password", () => resetPassword(target.id, { password: "Secret2026new" })],
    ["deactivate a user", () => toggleStatus(target.id, false)],
    ["end a session of another user", () => revokeUserSession(target.id, targetSessionId)],
    ["end all sessions of another user", () => revokeAllUserSessions(target.id)],
  ])("may not %s", async (_, action) => {
    await expectRefusedWithoutChanges(action);
  });

  it("is refused before the submitted data is looked at", async () => {
    await expect(createUserAction({})).resolves.toEqual(refused);
  });
});

describe.each<Role>(["EMPLOYEE", "CONTRACTOR"])("%s", (role) => {
  it("may not edit another user's profile or their own", async () => {
    const target = await createUser({ login: "petrov" });
    const actor = await createUser({ login: "actor", role });
    await actAs(actor);

    await expectRefusedWithoutChanges(async () =>
      updateUser(target.id, { ...(await editFormOf(target.id)), position: "Прораб" }),
    );
    await expectRefusedWithoutChanges(async () =>
      updateOwnProfile({ ...(await editFormOf(actor.id)), position: "Прораб" }),
    );
  });
});

describe("a manager editing another user", () => {
  let manager: TestUser;

  beforeEach(async () => {
    manager = await createUser({ login: "manager", role: "MANAGER" });
    await actAs(manager);
  });

  it("changes the profile of an employee, and the change is logged", async () => {
    const employee = await createUser({ login: "petrov" });

    const result = await updateUser(employee.id, {
      ...(await editFormOf(employee.id)),
      position: "Прораб",
    });

    expect(result).toEqual({ ok: true });
    expect(await db.user.findUnique({ where: { id: employee.id } })).toMatchObject({
      position: "Прораб",
      updatedById: manager.id,
    });
    expect(await auditEntries()).toEqual([
      expect.objectContaining({
        action: "UPDATE",
        actorId: manager.id,
        actorLogin: "manager",
        entityId: employee.id,
        changes: [{ field: "position", before: null, after: "Прораб" }],
      }),
    ]);
  });

  it.each<[string, Role, Partial<Awaited<ReturnType<typeof editFormOf>>>]>([
    ["the profile of an administrator", "ADMIN", { position: "Прораб" }],
    ["the comment", "EMPLOYEE", { comment: "Уволен" }],
    ["the role", "EMPLOYEE", { role: "MANAGER" }],
    ["the status", "EMPLOYEE", { isActive: false }],
  ])("may not change %s", async (_, role, change) => {
    const target = await createUser({ login: "petrov", role });

    await expectRefusedWithoutChanges(async () =>
      updateUser(target.id, { ...(await editFormOf(target.id)), ...change }),
    );
  });
});

describe("an administrator editing another administrator", () => {
  it("changes the profile and the comment", async () => {
    await actAs(await createUser({ login: "admin", role: "ADMIN" }));
    const deputy = await createUser({ login: "deputy", role: "ADMIN" });

    const result = await updateUser(deputy.id, {
      ...(await editFormOf(deputy.id)),
      position: "Главный инженер",
      comment: "Замещает на время отпуска",
    });

    expect(result).toEqual({ ok: true });
    expect(await db.user.findUnique({ where: { id: deputy.id } })).toMatchObject({
      position: "Главный инженер",
      comment: "Замещает на время отпуска",
    });
  });
});

describe("one's own profile", () => {
  it.each<Role>(["ADMIN", "MANAGER"])("is edited by %s, and the change is logged", async (role) => {
    const actor = await createUser({ login: "actor", role });
    await actAs(actor);

    const result = await updateOwnProfile({
      ...(await editFormOf(actor.id)),
      phone: " +380 44 000 00 00 ",
    });

    expect(result).toEqual({ ok: true });
    expect(await auditEntries()).toEqual([
      expect.objectContaining({
        action: "UPDATE",
        entity: "User",
        actorId: actor.id,
        entityId: actor.id,
        changes: [{ field: "phone", before: null, after: "+380 44 000 00 00" }],
      }),
    ]);
  });

  it("keeps the role, the status and the comment whatever the form sends", async () => {
    const manager = await createUser({ login: "manager", role: "MANAGER" });
    await actAs(manager);

    await updateOwnProfile({
      ...(await editFormOf(manager.id)),
      fullName: "Петров Пётр Петрович",
      role: "ADMIN",
      isActive: false,
      comment: "Сам себе администратор",
    });

    expect(await db.user.findUnique({ where: { id: manager.id } })).toMatchObject({
      fullName: "Петров Пётр Петрович",
      role: "MANAGER",
      isActive: true,
      comment: null,
    });
  });

  it("writes nothing when nothing has changed", async () => {
    const manager = await createUser({ login: "manager", role: "MANAGER" });
    await actAs(manager);
    const before = await databaseState();

    await expect(updateOwnProfile(await editFormOf(manager.id))).resolves.toEqual({ ok: true });
    expect(await databaseState()).toEqual(before);
  });

  it.each<Role>(["ADMIN", "MANAGER", "EMPLOYEE", "CONTRACTOR"])(
    "does not let %s end the current session from the session list",
    async (role) => {
      const current = await actAs(await createUser({ role }));

      await expect(revokeOwnSession(current.id)).resolves.toEqual({
        ok: false,
        error: "errors.invalidRequest",
      });
      expect(await db.session.findUnique({ where: { id: current.id } })).toMatchObject({
        revokedAt: null,
      });
    },
  );
});
