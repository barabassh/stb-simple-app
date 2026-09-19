import { describe, expect, it } from "vitest";

import { parseAuditListParams } from "@/features/audit/list-params";
import { listAuditLogsForExport } from "@/features/audit/queries";
import { usersExport } from "@/features/users/export";
import { parseUsersListParams } from "@/features/users/list-params";
import { listUsers, listUsersForExport } from "@/features/users/queries";
import type { Role } from "@/generated/prisma/enums";
import { logExport } from "@/lib/export/service";
import { PermissionDeniedError } from "@/lib/permissions";

import { auditEntries, createUser, exportDocument } from "./helpers";
import { TEST_IP, TEST_USER_AGENT } from "./request";
import { t } from "./translations";

describe("listUsersForExport", () => {
  it("reads every page the registry shows with the same filters, in the same order", async () => {
    for (let index = 1; index <= 27; index += 1) {
      await createUser({ login: `contractor${index}`, role: "CONTRACTOR" });
    }
    await createUser({ login: "employee", role: "EMPLOYEE" });
    const manager = await createUser({ login: "manager", role: "MANAGER" });
    const searchParams = { role: "CONTRACTOR", sort: "login", order: "desc" };

    const firstPage = await listUsers(manager, parseUsersListParams(searchParams));
    const secondPage = await listUsers(
      manager,
      parseUsersListParams({ ...searchParams, page: "2" }),
    );
    const exported = await listUsersForExport(
      manager,
      parseUsersListParams({ ...searchParams, page: "2" }),
    );

    expect(firstPage.rowCount).toBe(27);
    expect(exported.map((user) => user.login)).toEqual(
      [...firstPage.rows, ...secondPage.rows].map((user) => user.login),
    );
    expect(exported[0]).not.toHaveProperty("passwordHash");
  });

  it.each<Role>(["EMPLOYEE", "CONTRACTOR"])("refuses %s", async (role) => {
    await expect(
      listUsersForExport(await createUser({ role }), parseUsersListParams({})),
    ).rejects.toThrow(PermissionDeniedError);
  });
});

describe("listAuditLogsForExport", () => {
  it.each([
    ["without a period", {}],
    ["for a period longer than a month", { from: "2026-08-15", to: "2026-09-15" }],
  ])("refuses to read the journal %s", async (_, searchParams) => {
    const admin = await createUser({ role: "ADMIN" });

    await expect(
      listAuditLogsForExport(admin, parseAuditListParams(searchParams)),
    ).rejects.toThrow();
  });

  it.each<Role>(["MANAGER", "EMPLOYEE", "CONTRACTOR"])("refuses %s", async (role) => {
    const params = parseAuditListParams({ from: "2026-09-01", to: "2026-09-14" });

    await expect(listAuditLogsForExport(await createUser({ role }), params)).rejects.toThrow(
      PermissionDeniedError,
    );
  });
});

describe("an export", () => {
  it("is named after the report and the day, and is logged with the format and row count", async () => {
    const manager = await createUser({
      login: "manager",
      fullName: "Петров Пётр",
      role: "MANAGER",
    });
    await createUser({ login: "admin", role: "ADMIN" });
    await createUser({ login: "deputy", role: "ADMIN" });

    const content = await exportDocument(manager, usersExport, { role: "ADMIN" }, "pdf");
    await logExport(manager, usersExport, "pdf", content);

    expect(content.fileName).toMatch(/^users_\d{2}\.\d{2}\.\d{4}$/);
    expect(content.rows.map((row) => row.login)).toEqual(["admin", "deputy"]);
    expect(await auditEntries()).toEqual([
      expect.objectContaining({
        action: "EXPORT",
        actorId: manager.id,
        actorLogin: "manager",
        entity: "User",
        entityId: null,
        summary: t("audit.summaries.exported", {
          title: t("users.export.title"),
          format: t("export.formats.pdf"),
          count: 2,
        }),
        ip: TEST_IP,
        userAgent: TEST_USER_AGENT,
      }),
    ]);
  });
});
