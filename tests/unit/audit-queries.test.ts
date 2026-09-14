import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseAuditListParams } from "@/features/audit/list-params";
import { listAuditLogs, listEntityAuditLogs } from "@/features/audit/queries";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { PermissionDeniedError } from "@/lib/permissions";

vi.mock("@/lib/db", () => ({
  db: { auditLog: { findMany: vi.fn(), count: vi.fn() } },
}));

const USER_ID = "cjld2cjxh0000qzrmn831i7rn";
const table = parseAuditListParams({}).table;

const actingAs = (role: Role) => ({
  id: "cjld2cjxh0001qzrmn831i7rn",
  login: "actor",
  fullName: "Acting User",
  role,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.auditLog.findMany).mockResolvedValue([
    {
      id: "entry-1",
      at: new Date("2026-09-14T08:20:00Z"),
      actorLogin: "admin",
      action: "ROLE_CHANGE",
      entity: "User",
      entityId: USER_ID,
      summary: "Изменена роль пользователя ivanov",
      changes: [{ field: "role", before: "Сотрудник", after: "Менеджер" }],
      ip: "10.0.0.1",
      userAgent: "Mozilla/5.0 Chrome/140.0.0.0",
      actor: { fullName: "Администратор системы" },
    },
  ] as never);
  vi.mocked(db.auditLog.count).mockResolvedValue(1);
});

describe("listEntityAuditLogs", () => {
  it("shows a manager the history of a user without IP address and browser", async () => {
    const { rows } = await listEntityAuditLogs(actingAs("MANAGER"), "User", USER_ID, table);

    expect(rows[0]).toMatchObject({
      actorLogin: "admin",
      actorName: "Администратор системы",
      changes: [{ field: "role", before: "Сотрудник", after: "Менеджер" }],
      ip: null,
      userAgent: null,
    });
    expect(vi.mocked(db.auditLog.findMany).mock.calls[0][0]).toMatchObject({
      where: { entity: "User", entityId: USER_ID },
    });
  });

  it("keeps IP address and browser for an administrator", async () => {
    const { rows } = await listEntityAuditLogs(actingAs("ADMIN"), "User", USER_ID, table);

    expect(rows[0]).toMatchObject({ ip: "10.0.0.1", userAgent: "Mozilla/5.0 Chrome/140.0.0.0" });
  });

  it.each<Role>(["EMPLOYEE", "CONTRACTOR"])("refuses %s before reading", async (role) => {
    await expect(listEntityAuditLogs(actingAs(role), "User", USER_ID, table)).rejects.toThrow(
      PermissionDeniedError,
    );
    expect(db.auditLog.findMany).not.toHaveBeenCalled();
  });
});

describe("listAuditLogs", () => {
  it("keeps the journal closed to a manager who reads user histories", async () => {
    await expect(listAuditLogs(actingAs("MANAGER"), parseAuditListParams({}))).rejects.toThrow(
      PermissionDeniedError,
    );
    expect(db.auditLog.findMany).not.toHaveBeenCalled();
  });
});
