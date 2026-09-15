import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import type { ExportReport } from "@/lib/export";
import { logExport, prepareExport } from "@/lib/export/service";

// Translations echo the key with its values, so the test sees what went into each text.
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (namespace?: string) => {
    const t = (key: string, values?: Record<string, unknown>) =>
      [namespace, key].filter(Boolean).join(".") + (values ? ` ${JSON.stringify(values)}` : "");
    return Object.assign(t, { has: () => true });
  }),
}));
vi.mock("@/lib/request-info", () => ({
  getClientInfo: vi.fn(async () => ({ ip: "10.0.0.1", userAgent: "Mozilla/5.0 Chrome/140.0.0.0" })),
}));
vi.mock("@/lib/db", () => ({ db: { auditLog: { create: vi.fn() } } }));

const actor = {
  id: "cjld2cjxh0001qzrmn831i7rn",
  login: "manager",
  fullName: "Петров Пётр",
  role: "MANAGER" as const,
};

const report: ExportReport = {
  name: "users",
  path: "/users",
  permission: "users.export",
  entity: "User",
  load: vi.fn(async () => ({
    title: "Реестр пользователей",
    columns: [{ key: "login", header: "Логин" }],
    rows: [{ login: "ivanov" }, { login: "petrov" }],
  })),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("prepareExport", () => {
  it("names the file after the report and the day of the export", async () => {
    const content = await prepareExport(actor, report, { role: "EMPLOYEE" });

    expect(report.load).toHaveBeenCalledWith(actor, { role: "EMPLOYEE" });
    expect(content.fileName).toMatch(/^users_\d{2}\.\d{2}\.\d{4}$/);
    expect(content.labels.author).toBe('export.author {"name":"Петров Пётр","login":"manager"}');
    expect(content.labels.page(2, 5)).toBe('export.page {"page":2,"pages":5}');
  });
});

describe("logExport", () => {
  it("writes an EXPORT entry with the section, the format and the number of rows", async () => {
    const content = await prepareExport(actor, report, {});

    await logExport(actor, report, "pdf", content);

    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: actor.id,
        actorLogin: "manager",
        action: "EXPORT",
        entity: "User",
        entityId: null,
        summary:
          'audit.summaries.exported {"title":"Реестр пользователей","format":"export.formats.pdf","count":2}',
        ip: "10.0.0.1",
        userAgent: "Mozilla/5.0 Chrome/140.0.0.0",
      },
    });
  });
});
