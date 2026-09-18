"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { EllipsisIcon, EyeIcon, PencilIcon } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import { DataTable } from "@/components/data-table/data-table";
import type { DataTableFeatures } from "@/components/data-table/features";
import type { TableState } from "@/components/data-table/search-params";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SessionUser } from "@/lib/auth/session";
import { formatCalendarDate, formatDateTime, formatDecimal, formatMoney } from "@/lib/format";
import { formatAddress } from "@/lib/nl/address";
import { can } from "@/lib/permissions";

import type { ProjectColumn, ProjectSortColumn } from "../columns";
import type { ProjectListItem } from "../queries";
import { ProjectStatusBadge } from "./project-status-badge";

const columnHelper = createColumnHelper<DataTableFeatures, ProjectListItem>();

type ProjectsTableProps = {
  rows: ProjectListItem[];
  rowCount: number;
  state: TableState<ProjectSortColumn>;
  /** From projectColumns(): the columns the rows were read for. */
  columns: ProjectColumn[];
  emptyState?: React.ReactNode;
  /** Absent where the table is a list inside a card, without actions on the rows. */
  viewer?: Pick<SessionUser, "role">;
};

export function ProjectsTable({
  rows,
  rowCount,
  state,
  columns: visible,
  emptyState,
  viewer,
}: ProjectsTableProps) {
  const t = useTranslations("projects");
  const tShared = useTranslations("referenceBooks");
  const locale = useLocale();

  // Column ids match ProjectColumn: the sortable ones are written to the URL as the sort parameter.
  const columns = useMemo(() => {
    const show = (column: ProjectColumn) => visible.includes(column);
    const orDash = (value: string | null | undefined) => value || "—";

    return columnHelper.columns([
      columnHelper.accessor("number", {
        header: t("columns.number"),
        cell: ({ row }) => (
          <Link
            href={`/projects/${row.original.id}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {row.original.number}
          </Link>
        ),
      }),
      columnHelper.accessor("name", {
        header: t("columns.name"),
        cell: ({ getValue }) => (
          <div className="max-w-80 min-w-40 whitespace-normal">{getValue()}</div>
        ),
      }),
      ...(show("customer")
        ? [
            columnHelper.accessor((row) => row.customer?.name, {
              id: "customer",
              header: t("columns.customer"),
              cell: ({ row }) => {
                const customer = row.original.customer;
                if (!customer) return "—";
                return (
                  <div className="min-w-40 whitespace-normal">
                    {customer.isActive
                      ? customer.name
                      : tShared("archivedMark", { name: customer.name })}
                  </div>
                );
              },
            }),
          ]
        : []),
      ...(show("address")
        ? [
            columnHelper.display({
              id: "address",
              header: t("columns.address"),
              cell: ({ row }) => (
                <div className="min-w-48 whitespace-normal">
                  {formatAddress(row.original.address, locale)}
                </div>
              ),
            }),
          ]
        : []),
      columnHelper.accessor("startDate", {
        header: t("columns.startDate"),
        cell: ({ getValue }) => formatCalendarDate(getValue()),
      }),
      ...(show("duration")
        ? [
            columnHelper.display({
              id: "duration",
              header: t("columns.duration"),
              cell: ({ row }) => row.original.duration ?? t("notStarted"),
            }),
          ]
        : []),
      ...(show("status")
        ? [
            columnHelper.accessor("status", {
              header: t("columns.status"),
              cell: ({ getValue }) => {
                const status = getValue();
                return status ? <ProjectStatusBadge status={status} /> : "—";
              },
            }),
          ]
        : []),
      ...(show("budgetAmount")
        ? [
            columnHelper.accessor((row) => row.budget?.amount, {
              id: "budgetAmount",
              header: t("columns.budgetAmount"),
              cell: ({ getValue }) => orDash(formatMoney(getValue())),
            }),
          ]
        : []),
      ...(show("budgetHours")
        ? [
            columnHelper.accessor((row) => row.budget?.hours, {
              id: "budgetHours",
              header: t("columns.budgetHours"),
              cell: ({ getValue }) => orDash(formatDecimal(getValue())),
            }),
          ]
        : []),
      ...(show("updatedAt")
        ? [
            columnHelper.accessor("updatedAt", {
              header: t("columns.updatedAt"),
              cell: ({ getValue }) => orDash(formatDateTime(getValue())),
            }),
          ]
        : []),
      ...(viewer
        ? [
            columnHelper.display({
              id: "actions",
              header: () => <span className="sr-only">{t("list.actionsColumn")}</span>,
              cell: ({ row }) => <ProjectRowActions project={row.original} viewer={viewer} />,
            }),
          ]
        : []),
    ]);
  }, [t, tShared, locale, visible, viewer]);

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

function ProjectRowActions({
  project,
  viewer,
}: {
  project: ProjectListItem;
  viewer: Pick<SessionUser, "role">;
}) {
  const t = useTranslations("projects");

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("list.rowActions", { number: project.number })}
        >
          <EllipsisIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto">
        <DropdownMenuItem asChild>
          <Link href={`/projects/${project.id}`}>
            <EyeIcon aria-hidden />
            {t("actions.open")}
          </Link>
        </DropdownMenuItem>
        {/* A closed project is not edited by anyone (docs/ТЗ.md, 6.7). */}
        {can(viewer, "projects.update") && project.status === "IN_PROGRESS" && (
          <DropdownMenuItem asChild>
            <Link href={`/projects/${project.id}/edit`}>
              <PencilIcon aria-hidden />
              {t("actions.edit")}
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
