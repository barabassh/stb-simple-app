import { describe, expect, it } from "vitest";

import { AUDIT_EXCLUDED_FIELDS, diffEntity, readAuditChanges } from "@/lib/audit";

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
