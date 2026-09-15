import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseAuditListParams } from "@/features/audit/list-params";
import { listAuditLogs, listAuditLogsForExport } from "@/features/audit/queries";
import { parseUsersListParams } from "@/features/users/list-params";
import { listUsers, listUsersForExport } from "@/features/users/queries";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { PermissionDeniedError } from "@/lib/permissions";

vi.mock("@/lib/db", () => ({
  db: {
    user: { findMany: vi.fn(), count: vi.fn() },
    auditLog: { findMany: vi.fn(), count: vi.fn() },
  },
}));

const actingAs = (role: Role) => ({
  id: "cjld2cjxh0001qzrmn831i7rn",
  login: "actor",
  fullName: "Acting User",
  role,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.user.findMany).mockResolvedValue([]);
  vi.mocked(db.user.count).mockResolvedValue(0);
  vi.mocked(db.auditLog.findMany).mockResolvedValue([]);
  vi.mocked(db.auditLog.count).mockResolvedValue(0);
});

describe("listUsersForExport", () => {
  const params = parseUsersListParams({
    q: "iva",
    role: "MANAGER,CONTRACTOR",
    status: "all",
    sort: "login",
    order: "desc",
    page: "3",
    pageSize: "50",
  });

  it("reads every page of what the registry shows with the same parameters", async () => {
    await listUsers(actingAs("ADMIN"), params);
    await listUsersForExport(actingAs("MANAGER"), params);

    const [page, all] = vi.mocked(db.user.findMany).mock.calls.map(([args]) => args);
    expect(page).toMatchObject({ skip: 100, take: 50 });
    expect(all).toEqual({ where: page?.where, select: page?.select, orderBy: page?.orderBy });
    expect(all?.where).toMatchObject({ role: { in: ["MANAGER", "CONTRACTOR"] } });
  });

  it("selects no password hash", async () => {
    await listUsersForExport(actingAs("ADMIN"), params);

    expect(vi.mocked(db.user.findMany).mock.calls[0][0]?.select).not.toHaveProperty("passwordHash");
  });

  it.each<Role>(["EMPLOYEE", "CONTRACTOR"])("refuses %s before reading", async (role) => {
    await expect(listUsersForExport(actingAs(role), params)).rejects.toThrow(PermissionDeniedError);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });
});

describe("listAuditLogsForExport", () => {
  const params = parseAuditListParams({
    actor: "admin",
    action: "LOGIN,EXPORT",
    from: "2026-09-01",
    to: "2026-09-14",
    order: "asc",
    page: "2",
  });

  it("reads every page of what the journal shows with the same parameters", async () => {
    await listAuditLogs(actingAs("ADMIN"), params);
    await listAuditLogsForExport(actingAs("ADMIN"), params);

    const [page, all] = vi.mocked(db.auditLog.findMany).mock.calls.map(([args]) => args);
    expect(page).toMatchObject({ skip: 25, take: 25 });
    expect(all).toEqual({ where: page?.where, select: page?.select, orderBy: page?.orderBy });
  });

  it.each([
    ["without a period", {}],
    ["for a period longer than a month", { from: "2026-08-15", to: "2026-09-15" }],
  ])("refuses to read the journal %s", async (_, searchParams) => {
    await expect(
      listAuditLogsForExport(actingAs("ADMIN"), parseAuditListParams(searchParams)),
    ).rejects.toThrow();
    expect(db.auditLog.findMany).not.toHaveBeenCalled();
  });

  it.each<Role>(["MANAGER", "EMPLOYEE", "CONTRACTOR"])(
    "refuses %s before reading",
    async (role) => {
      await expect(listAuditLogsForExport(actingAs(role), params)).rejects.toThrow(
        PermissionDeniedError,
      );
      expect(db.auditLog.findMany).not.toHaveBeenCalled();
    },
  );
});
