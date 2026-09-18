"use client";

import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { DataTable } from "@/components/data-table/data-table";
import type { DataTableFeatures } from "@/components/data-table/features";
import type { TableState } from "@/components/data-table/search-params";
import type { SessionUser } from "@/lib/auth/session";
import { formatDate, formatDateTime } from "@/lib/format";

import type { UserSortColumn } from "../list-params";
import type { UserListItem } from "../queries";
import { UserRowActions } from "./user-row-actions";
import { UserStatusBadge } from "./user-status-badge";

const columnHelper = createColumnHelper<DataTableFeatures, UserListItem>();

type UsersTableProps = {
  rows: UserListItem[];
  rowCount: number;
  state: TableState<UserSortColumn>;
  emptyState?: React.ReactNode;
  viewer: Pick<SessionUser, "role">;
};

export function UsersTable({ rows, rowCount, state, emptyState, viewer }: UsersTableProps) {
  const t = useTranslations("users");

  // Column ids match USER_SORT_COLUMNS: the table writes them to the URL as the sort parameter.
  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("login", {
          header: t("columns.login"),
          cell: ({ row }) => (
            <Link
              href={`/users/${row.original.id}`}
              className="font-medium underline-offset-4 hover:underline"
            >
              {row.original.login}
            </Link>
          ),
        }),
        columnHelper.accessor("fullName", { header: t("columns.fullName") }),
        columnHelper.accessor("nickname", { header: t("columns.nickname") }),
        columnHelper.accessor("position", {
          header: t("columns.position"),
          cell: ({ getValue }) => getValue() ?? "—",
        }),
        columnHelper.accessor("role", {
          header: t("columns.role"),
          cell: ({ getValue }) => t(`roles.${getValue()}`),
        }),
        columnHelper.accessor("isActive", {
          header: t("columns.status"),
          cell: ({ getValue }) => <UserStatusBadge isActive={getValue()} />,
        }),
        columnHelper.accessor("lastLoginAt", {
          header: t("columns.lastLoginAt"),
          cell: ({ getValue }) => formatDateTime(getValue()) || "—",
        }),
        columnHelper.accessor("createdAt", {
          header: t("columns.createdAt"),
          cell: ({ getValue }) => formatDate(getValue()),
        }),
        columnHelper.display({
          id: "actions",
          header: () => <span className="sr-only">{t("columns.actions")}</span>,
          cell: ({ row }) => <UserRowActions user={row.original} viewer={viewer} />,
        }),
      ]),
    [t, viewer],
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      rowCount={rowCount}
      state={state}
      emptyState={emptyState}
      getRowId={(row) => row.id}
    />
  );
}
