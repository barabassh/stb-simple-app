import { describe, expect, it } from "vitest";

import { parseAuditListParams } from "@/features/audit/list-params";
import { listAuditLogs, listEntityAuditLogs } from "@/features/audit/queries";
import {
  createUser as createUserAction,
  resetPassword,
  toggleStatus,
  updateUser,
} from "@/features/users/actions";
import type { Role } from "@/generated/prisma/enums";
import { logAudit } from "@/lib/audit";
import { createSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { PermissionDeniedError } from "@/lib/permissions";

import {
  activeSessions,
  actAs,
  auditEntries,
  auditLogText,
  createUser,
  editFormOf,
  PASSWORD,
} from "./helpers";
import { TEST_IP, TEST_USER_AGENT } from "./request";
import { t } from "./translations";

describe("logAudit", () => {
  it("writes the author's login next to the id", async () => {
    const author = await createUser({ login: "ivanov" });

    await logAudit(db, {
      actor: author,
      action: "UPDATE",
      entity: "User",
      entityId: author.id,
      summary: "Изменены данные пользователя ivanov",
      changes: [{ field: "position", before: null, after: "Прораб" }],
      ip: TEST_IP,
      userAgent: TEST_USER_AGENT,
    });

    expect(await auditEntries()).toEqual([
      expect.objectContaining({
        actorId: author.id,
        actorLogin: "ivanov",
        entityId: author.id,
        changes: [{ field: "position", before: null, after: "Прораб" }],
        ip: TEST_IP,
      }),
    ]);
  });

  it("drops excluded fields from changes built by hand and stores no empty list", async () => {
    await logAudit(db, {
      actor: { id: null, login: "unknown" },
      action: "PASSWORD_CHANGE",
      entity: "User",
      summary: "Сброшен пароль",
      changes: [
        { field: "newPassword", before: null, after: "Secret2026x" },
        { field: "passwordHash", before: "$argon2id$old", after: "$argon2id$new" },
      ],
    });

    expect(await auditEntries()).toEqual([
      expect.objectContaining({ actorId: null, changes: null, ip: null }),
    ]);
    expect(await auditLogText()).not.toMatch(/Secret2026x|argon2/);
  });

  it("is rolled back together with the change it describes", async () => {
    const user = await createUser({ login: "ivanov" });

    await expect(
      db.$transaction(async (tx) => {
        await tx.user.update({ where: { id: user.id }, data: { position: "Прораб" } });
        await logAudit(tx, {
          actor: user,
          action: "UPDATE",
          entity: "User",
          entityId: user.id,
          summary: "Изменены данные пользователя ivanov",
        });
        throw new Error("the change failed");
      }),
    ).rejects.toThrow("the change failed");

    expect(await auditEntries()).toEqual([]);
  });
});

describe("changes to users", () => {
  it("log a created user with readable values and without the password", async () => {
    const admin = await createUser({ login: "admin", role: "ADMIN" });
    await actAs(admin);

    const result = await createUserAction({
      login: "Sidorov",
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
    });

    expect(result).toMatchObject({ ok: true });
    expect(await auditEntries()).toEqual([
      expect.objectContaining({
        action: "CREATE",
        actorId: admin.id,
        actorLogin: "admin",
        entity: "User",
        entityId: (result as { id: string }).id,
        summary: t("audit.summaries.userCreated", { login: "sidorov" }),
        changes: [
          { field: "login", before: null, after: "sidorov" },
          { field: "fullName", before: null, after: "Сидоров Сидор" },
          { field: "nickname", before: null, after: "Сидор" },
          { field: "role", before: null, after: t("users.roles.EMPLOYEE") },
          { field: "isActive", before: null, after: t("users.statuses.active") },
        ],
        ip: TEST_IP,
        userAgent: TEST_USER_AGENT,
      }),
    ]);
    expect(await auditLogText()).not.toMatch(/Secret2026new|argon2/);
  });

  it("log a password reset as a fact, without the password or its hash", async () => {
    const admin = await createUser({ login: "admin", role: "ADMIN" });
    const employee = await createUser({ login: "petrov" });
    const employeeSession = await createSession(employee.id, null, null);
    await actAs(admin);

    await expect(resetPassword(employee.id, { password: "Secret2026new" })).resolves.toEqual({
      ok: true,
    });

    expect(await auditEntries()).toEqual([
      expect.objectContaining({
        action: "PASSWORD_CHANGE",
        entityId: employee.id,
        summary: t("audit.summaries.passwordReset", { login: "petrov" }),
        changes: null,
      }),
    ]);
    const { passwordHash } = await db.user.findUniqueOrThrow({ where: { id: employee.id } });
    const journal = await auditLogText();
    for (const secret of ["Secret2026new", PASSWORD, passwordHash, employeeSession.token]) {
      expect(journal).not.toContain(secret);
    }
    expect(await activeSessions(employee.id)).toEqual([]);
  });

  it("log a role change apart from the other fields of the same form", async () => {
    await actAs(await createUser({ login: "admin", role: "ADMIN" }));
    const employee = await createUser({ login: "petrov" });

    await updateUser(employee.id, {
      ...(await editFormOf(employee.id)),
      position: "Прораб",
      role: "MANAGER",
    });

    expect(await auditEntries()).toEqual([
      expect.objectContaining({
        action: "UPDATE",
        changes: [{ field: "position", before: null, after: "Прораб" }],
      }),
      expect.objectContaining({
        action: "ROLE_CHANGE",
        changes: [
          { field: "role", before: t("users.roles.EMPLOYEE"), after: t("users.roles.MANAGER") },
        ],
      }),
    ]);
  });

  it("log a deactivation, which ends the user's sessions", async () => {
    await actAs(await createUser({ login: "admin", role: "ADMIN" }));
    const employee = await createUser({ login: "petrov" });
    await createSession(employee.id, null, null);

    await expect(toggleStatus(employee.id, false)).resolves.toEqual({ ok: true });

    expect(await activeSessions(employee.id)).toEqual([]);
    expect(await auditEntries()).toEqual([
      expect.objectContaining({
        action: "STATUS_CHANGE",
        entityId: employee.id,
        summary: t("audit.summaries.userDeactivated", { login: "petrov" }),
        changes: [
          {
            field: "isActive",
            before: t("users.statuses.active"),
            after: t("users.statuses.inactive"),
          },
        ],
      }),
    ]);
  });
});

describe("reading the journal", () => {
  const table = parseAuditListParams({}).table;

  async function givenHistoryOfEmployee() {
    const admin = await createUser({
      login: "admin",
      fullName: "Администратор системы",
      role: "ADMIN",
    });
    const employee = await createUser({ login: "petrov" });
    await actAs(admin);
    await updateUser(employee.id, { ...(await editFormOf(employee.id)), position: "Прораб" });
    return { admin, employee };
  }

  it("shows a manager the history of a user without IP address and browser", async () => {
    const { employee } = await givenHistoryOfEmployee();
    const manager = await createUser({ role: "MANAGER" });

    const { rows } = await listEntityAuditLogs(manager, "User", employee.id, table);

    expect(rows).toEqual([
      expect.objectContaining({
        actorLogin: "admin",
        actorName: "Администратор системы",
        changes: [{ field: "position", before: null, after: "Прораб" }],
        ip: null,
        userAgent: null,
      }),
    ]);
  });

  it("keeps IP address and browser in the history for an administrator", async () => {
    const { admin, employee } = await givenHistoryOfEmployee();

    const { rows } = await listEntityAuditLogs(admin, "User", employee.id, table);

    expect(rows).toEqual([expect.objectContaining({ ip: TEST_IP, userAgent: TEST_USER_AGENT })]);
  });

  it.each<Role>(["EMPLOYEE", "CONTRACTOR"])("refuses %s the history of a user", async (role) => {
    const { employee } = await givenHistoryOfEmployee();

    await expect(
      listEntityAuditLogs(await createUser({ role }), "User", employee.id, table),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it.each<Role>(["MANAGER", "EMPLOYEE", "CONTRACTOR"])(
    "keeps the journal closed to %s",
    async (role) => {
      await givenHistoryOfEmployee();

      await expect(
        listAuditLogs(await createUser({ role }), parseAuditListParams({})),
      ).rejects.toThrow(PermissionDeniedError);
    },
  );

  it("keeps the entries of a deactivated author readable with the login", async () => {
    const { admin } = await givenHistoryOfEmployee();
    const deputy = await createUser({ login: "deputy", role: "ADMIN" });
    await actAs(deputy);
    await toggleStatus(admin.id, false);

    const { rows } = await listAuditLogs(deputy, parseAuditListParams({ actor: "admin" }));

    expect(rows.map((row) => row.actorLogin)).toEqual(["admin"]);
  });
});
