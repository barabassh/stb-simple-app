"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { DataTable } from "@/components/data-table/data-table";
import type { DataTableFeatures } from "@/components/data-table/features";
import type { TableState } from "@/components/data-table/search-params";
import { formatDateTime } from "@/lib/format";

import type { AuditSortColumn } from "../list-params";
import type { AuditLogItem } from "../queries";
import { AuditDetails } from "./audit-details";

const columnHelper = createColumnHelper<DataTableFeatures, AuditLogItem>();

type AuditTableProps = {
  rows: AuditLogItem[];
  rowCount: number;
  state: TableState<AuditSortColumn>;
  emptyState?: React.ReactNode;
  /** Off in the history of a single record, where every row has the same entity. */
  showEntity?: boolean;
  /** Off for a reader of a record's history who may not open the journal. */
  showRequestInfo?: boolean;
};

export function AuditTable({
  rows,
  rowCount,
  state,
  emptyState,
  showEntity = true,
  showRequestInfo = true,
}: AuditTableProps) {
  const t = useTranslations("audit");

  // Only the time is sortable: it is the only column in AUDIT_SORT_COLUMNS.
  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("at", {
          header: t("columns.at"),
          cell: ({ getValue }) => formatDateTime(getValue()),
        }),
        columnHelper.accessor("actorLogin", {
          id: "actor",
          header: t("columns.actor"),
          enableSorting: false,
          cell: ({ row }) => (
            <div className="flex flex-col">
              <span className="font-medium">{row.original.actorLogin}</span>
              {row.original.actorName && (
                <span className="text-xs text-muted-foreground">{row.original.actorName}</span>
              )}
            </div>
          ),
        }),
        columnHelper.accessor("action", {
          header: t("columns.action"),
          enableSorting: false,
          cell: ({ getValue }) => t(`actions.${getValue()}`),
        }),
        ...(showEntity
          ? [
              columnHelper.accessor("entity", {
                header: t("columns.entity"),
                enableSorting: false,
                cell: ({ getValue }) => {
                  const key = `entities.${getValue()}`;
                  return t.has(key) ? t(key) : getValue();
                },
              }),
            ]
          : []),
        columnHelper.accessor("summary", {
          header: t("columns.summary"),
          enableSorting: false,
          cell: ({ getValue }) => <div className="min-w-64 whitespace-normal">{getValue()}</div>,
        }),
      ]),
    [t, showEntity],
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      rowCount={rowCount}
      state={state}
      emptyState={emptyState}
      getRowId={(row) => row.id}
      renderRowDetails={(row) => <AuditDetails entry={row} showRequestInfo={showRequestInfo} />}
    />
  );
}
