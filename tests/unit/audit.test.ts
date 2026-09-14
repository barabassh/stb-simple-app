import { describe, expect, it, vi } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import { AUDIT_EXCLUDED_FIELDS, diffEntity, logAudit, readAuditChanges } from "@/lib/audit";

describe("diffEntity", () => {
  it("lists only the fields whose values changed", () => {
    const changes = diffEntity(
      { fullName: "Иванов Иван", position: "Прораб", role: "Сотрудник", phone: null },
      { fullName: "Иванов Иван", position: "Главный инженер", role: "Менеджер", phone: null },
    );

    expect(changes).toEqual([
      { field: "position", before: "Прораб", after: "Главный инженер" },
      { field: "role", before: "Сотрудник", after: "Менеджер" },
    ]);
  });

  it("returns nothing for an unchanged record", () => {
    const snapshot = { login: "ivanov", isActive: "Активен", updatedAt: new Date("2026-09-14") };

    expect(diffEntity(snapshot, { ...snapshot, updatedAt: new Date("2026-09-14") })).toEqual([]);
  });

  it.each(AUDIT_EXCLUDED_FIELDS)("never includes %s, even when it changed", (field) => {
    const changes = diffEntity(
      { fullName: "Иванов Иван", [field]: "old-secret" },
      { fullName: "Иванов И.", [field]: "new-secret" },
    );

    expect(changes).toEqual([{ field: "fullName", before: "Иванов Иван", after: "Иванов И." }]);
    expect(JSON.stringify(changes)).not.toContain("secret");
  });

  it("excludes a sensitive field that only one of the snapshots has", () => {
    expect(
      diffEntity({ login: "ivanov" }, { login: "ivanov", passwordHash: "$argon2id$..." }),
    ).toEqual([]);
  });

  it("lists the filled fields of a created record and skips the empty ones", () => {
    const changes = diffEntity(null, {
      login: "petrov",
      password: "Secret2026x",
      email: null,
      role: "Подрядчик",
    });

    expect(changes).toEqual([
      { field: "login", before: null, after: "petrov" },
      { field: "role", before: null, after: "Подрядчик" },
    ]);
  });

  it("treats a missing value and null as the same", () => {
    expect(diffEntity({ comment: undefined }, { comment: null })).toEqual([]);
  });
});

describe("logAudit", () => {
  function fakeClient() {
    const create = vi.fn();
    return { client: { auditLog: { create } } as unknown as Prisma.TransactionClient, create };
  }

  it("writes the author's login as a string next to the id", async () => {
    const { client, create } = fakeClient();

    await logAudit(client, {
      actor: { id: "user-1", login: "ivanov" },
      action: "UPDATE",
      entity: "User",
      entityId: "user-2",
      summary: "Изменены данные пользователя petrov",
      changes: [{ field: "position", before: null, after: "Прораб" }],
      ip: "10.0.0.1",
      userAgent: "Chrome",
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        actorId: "user-1",
        actorLogin: "ivanov",
        action: "UPDATE",
        entity: "User",
        entityId: "user-2",
        summary: "Изменены данные пользователя petrov",
        changes: [{ field: "position", before: null, after: "Прораб" }],
        ip: "10.0.0.1",
        userAgent: "Chrome",
      },
    });
  });

  it("drops excluded fields from changes built by hand and stores no empty list", async () => {
    const { client, create } = fakeClient();

    await logAudit(client, {
      actor: { id: null, login: "unknown" },
      action: "PASSWORD_CHANGE",
      entity: "User",
      summary: "Сброшен пароль",
      changes: [
        { field: "newPassword", before: null, after: "Secret2026x" },
        { field: "passwordHash", before: "$argon2id$old", after: "$argon2id$new" },
      ],
    });

    const { data } = create.mock.calls[0][0];
    expect(data).not.toHaveProperty("changes");
    expect(data).toMatchObject({ actorId: null, entityId: null, ip: null, userAgent: null });
    expect(JSON.stringify(data)).not.toMatch(/Secret|argon2/);
  });
});

describe("readAuditChanges", () => {
  it("keeps well-formed changes and skips the rest", () => {
    expect(
      readAuditChanges([
        { field: "role", before: "Сотрудник", after: "Менеджер" },
        { field: "email", before: { nested: true }, after: null },
        "garbage",
      ]),
    ).toEqual([{ field: "role", before: "Сотрудник", after: "Менеджер" }]);
    expect(readAuditChanges(null)).toEqual([]);
  });
});
