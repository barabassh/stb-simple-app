import { getTranslations } from "next-intl/server";

import { defineExportReport } from "@/lib/export";

import { parseUsersListParams } from "./list-params";
import { listUsersForExport } from "./queries";

type UserExportRow = {
  login: string;
  fullName: string;
  position: string | null;
  role: string;
  status: string;
  lastLoginAt: Date | null;
  createdAt: Date;
};

/** The columns of the registry (docs/ТЗ.md, 4.4): no password hash or any other service field. */
export const usersExport = defineExportReport<UserExportRow>({
  name: "users",
  path: "/users",
  permission: "users.export",
  entity: "User",
  async load(actor, searchParams) {
    const [t, users] = await Promise.all([
      getTranslations("users"),
      listUsersForExport(actor, parseUsersListParams(searchParams)),
    ]);

    return {
      title: t("export.title"),
      columns: [
        { key: "login", header: t("columns.login") },
        { key: "fullName", header: t("columns.fullName") },
        { key: "position", header: t("columns.position") },
        { key: "role", header: t("columns.role") },
        { key: "status", header: t("columns.status") },
        { key: "lastLoginAt", header: t("columns.lastLoginAt"), format: "datetime" },
        { key: "createdAt", header: t("columns.createdAt"), format: "date" },
      ],
      rows: users.map((user) => ({
        login: user.login,
        fullName: user.fullName,
        position: user.position,
        role: t(`roles.${user.role}`),
        status: t(user.isActive ? "statuses.active" : "statuses.inactive"),
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      })),
    };
  },
});
