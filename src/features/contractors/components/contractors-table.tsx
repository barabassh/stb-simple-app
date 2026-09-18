"use client";

import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { DataTable } from "@/components/data-table/data-table";
import type { DataTableFeatures } from "@/components/data-table/features";
import type { TableState } from "@/components/data-table/search-params";
import { ReferenceRowActions } from "@/components/reference-book/row-actions";
import { ReferenceStatusBadge } from "@/components/reference-book/status-badge";
import type { SessionUser } from "@/lib/auth/session";

import { changeContractorStatus } from "../actions";
import type { ContractorSortColumn } from "../list-params";
import type { ContractorListItem } from "../queries";

const columnHelper = createColumnHelper<DataTableFeatures, ContractorListItem>();

type ContractorsTableProps = {
  rows: ContractorListItem[];
  rowCount: number;
  state: TableState<ContractorSortColumn>;
  emptyState?: React.ReactNode;
  viewer: Pick<SessionUser, "role">;
};

export function ContractorsTable({
  rows,
  rowCount,
  state,
  emptyState,
  viewer,
}: ContractorsTableProps) {
  const t = useTranslations("contractors");
  const tShared = useTranslations("referenceBooks");

  // Column ids match CONTRACTOR_SORT_COLUMNS: the table writes them to the URL as the sort parameter.
  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("name", {
          header: t("columns.name"),
          cell: ({ row }) => (
            <Link
              href={`/contractors/${row.original.id}`}
              className="font-medium underline-offset-4 hover:underline"
            >
              {row.original.name}
            </Link>
          ),
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
          cell: ({ getValue }) => <ReferenceStatusBadge isActive={getValue()} />,
        }),
        columnHelper.display({
          id: "actions",
          header: () => <span className="sr-only">{tShared("list.actionsColumn")}</span>,
          cell: ({ row }) => (
            <ReferenceRowActions
              section="contractors"
              target={row.original}
              changeStatus={changeContractorStatus}
              viewer={viewer}
            />
          ),
        }),
      ]),
    [t, tShared, viewer],
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
