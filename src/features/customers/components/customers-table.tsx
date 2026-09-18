"use client";

import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { DataTable } from "@/components/data-table/data-table";
import type { DataTableFeatures } from "@/components/data-table/features";
import type { TableState } from "@/components/data-table/search-params";
import type { SessionUser } from "@/lib/auth/session";

import type { CustomerSortColumn } from "../list-params";
import type { CustomerListItem } from "../queries";
import { CustomerRowActions } from "./customer-row-actions";
import { CustomerStatusBadge } from "./customer-status-badge";

const columnHelper = createColumnHelper<DataTableFeatures, CustomerListItem>();

type CustomersTableProps = {
  rows: CustomerListItem[];
  rowCount: number;
  state: TableState<CustomerSortColumn>;
  emptyState?: React.ReactNode;
  viewer: Pick<SessionUser, "role">;
};

export function CustomersTable({ rows, rowCount, state, emptyState, viewer }: CustomersTableProps) {
  const t = useTranslations("customers");

  // Column ids match CUSTOMER_SORT_COLUMNS: the table writes them to the URL as the sort parameter.
  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("name", {
          header: t("columns.name"),
          cell: ({ row }) => (
            <Link
              href={`/customers/${row.original.id}`}
              className="font-medium underline-offset-4 hover:underline"
            >
              {row.original.name}
            </Link>
          ),
        }),
        columnHelper.accessor("type", {
          header: t("columns.type"),
          cell: ({ getValue }) => t(`types.${getValue()}`),
        }),
        columnHelper.accessor("kvkNumber", {
          header: t("columns.kvkNumber"),
          cell: ({ getValue }) => getValue() ?? "—",
        }),
        columnHelper.accessor("contactPerson", {
          header: t("columns.contactPerson"),
          cell: ({ getValue }) => getValue() ?? "—",
        }),
        columnHelper.accessor("phone", {
          header: t("columns.phone"),
          cell: ({ getValue }) => getValue() ?? "—",
        }),
        columnHelper.accessor("email", {
          header: t("columns.email"),
          cell: ({ getValue }) => getValue() ?? "—",
        }),
        columnHelper.accessor("city", {
          header: t("columns.city"),
          cell: ({ getValue }) => getValue() ?? "—",
        }),
        columnHelper.accessor("isActive", {
          header: t("columns.status"),
          cell: ({ getValue }) => <CustomerStatusBadge isActive={getValue()} />,
        }),
        columnHelper.display({
          id: "actions",
          header: () => <span className="sr-only">{t("columns.actions")}</span>,
          cell: ({ row }) => <CustomerRowActions customer={row.original} viewer={viewer} />,
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
