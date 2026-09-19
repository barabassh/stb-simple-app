"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { CheckCheckIcon, EllipsisIcon, EyeIcon, PencilIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable } from "@/components/data-table/data-table";
import type { DataTableFeatures } from "@/components/data-table/features";
import type { TableState } from "@/components/data-table/search-params";
import { useRunAction } from "@/components/use-run-action";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SessionUser } from "@/lib/auth/session";
import { formatCalendarDate, formatDateTime, formatNumber } from "@/lib/format";
import { can } from "@/lib/permissions";

import { approveReports, deleteReport } from "../actions";
import type { ReportColumn, ReportSortColumn } from "../columns";
import type { ReportListItem } from "../queries";
import { availableReportActions } from "../report-actions";
import { formatHours, formatTime } from "../time";
import { ReportStatusBadge } from "./report-status-badge";

const columnHelper = createColumnHelper<DataTableFeatures, ReportListItem>();

type ReportsTableProps = {
  rows: ReportListItem[];
  rowCount: number;
  state: TableState<ReportSortColumn>;
  /** From reportColumns(): the columns the rows were read for. */
  columns: ReportColumn[];
  emptyState?: React.ReactNode;
  viewer: Pick<SessionUser, "role">;
  /** Whose project cards the reader may open: all, or only those in progress (a contractor). */
  projectLinks: "all" | "inProgress";
};

export function ReportsTable({
  rows,
  rowCount,
  state,
  columns: visible,
  emptyState,
  viewer,
  projectLinks,
}: ReportsTableProps) {
  const t = useTranslations("reports");
  const tShared = useTranslations("referenceBooks");
  const tAll = useTranslations();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [isApproving, startApproving] = useTransition();
  const canApprove = can(viewer, "reports.approve");

  // Ticks are offered on the reports that can be approved; ids left from another page are ignored.
  const selectable = useMemo(
    () =>
      canApprove
        ? rows.filter((row) => availableReportActions(viewer, row).approve).map((row) => row.id)
        : [],
    [rows, viewer, canApprove],
  );
  const chosen = selectable.filter((id) => selected.has(id));

  const columns = useMemo(() => {
    const show = (column: ReportColumn) => visible.includes(column);
    const date = (row: ReportListItem) => formatCalendarDate(row.workDate);
    const allChosen = selectable.length > 0 && selectable.every((id) => selected.has(id));
    const someChosen = selectable.some((id) => selected.has(id));

    function toggle(id: string, checked: boolean) {
      setSelected((current) => {
        const next = new Set(current);
        if (checked) next.add(id);
        else next.delete(id);
        return next;
      });
    }

    return columnHelper.columns([
      ...(canApprove
        ? [
            columnHelper.display({
              id: "select",
              header: () =>
                selectable.length > 0 ? (
                  <Checkbox
                    checked={allChosen ? true : someChosen ? "indeterminate" : false}
                    onCheckedChange={(checked) =>
                      setSelected(new Set(checked === true ? selectable : []))
                    }
                    aria-label={t("list.selectPage")}
                  />
                ) : (
                  <span className="sr-only">{t("list.selectColumn")}</span>
                ),
              cell: ({ row }) =>
                selectable.includes(row.original.id) && (
                  <Checkbox
                    checked={selected.has(row.original.id)}
                    onCheckedChange={(checked) => toggle(row.original.id, checked === true)}
                    aria-label={t("list.selectRow", { date: date(row.original) })}
                  />
                ),
            }),
          ]
        : []),
      columnHelper.accessor("workDate", {
        header: t("columns.workDate"),
        cell: ({ row }) => (
          <Link
            href={`/reports/${row.original.id}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {date(row.original)}
          </Link>
        ),
      }),
      ...(show("worker")
        ? [
            columnHelper.accessor((row) => row.worker?.fullName, {
              id: "worker",
              header: t("columns.worker"),
              cell: ({ getValue }) => (
                <div className="max-w-56 min-w-36 whitespace-normal">{getValue() ?? "—"}</div>
              ),
            }),
          ]
        : []),
      ...(show("organization")
        ? [
            columnHelper.display({
              id: "organization",
              header: t("columns.organization"),
              cell: ({ row }) => {
                const organization = row.original.organization;
                return (
                  <div className="max-w-56 min-w-32 whitespace-normal">
                    {!organization
                      ? t("form.ourCompany")
                      : organization.isActive
                        ? organization.name
                        : tShared("archivedMark", { name: organization.name })}
                  </div>
                );
              },
            }),
          ]
        : []),
      columnHelper.accessor((row) => row.project.number, {
        id: "project",
        header: t("columns.project"),
        cell: ({ row }) => {
          const { project } = row.original;
          const text = `${project.number} · ${project.name}`;
          // A contractor keeps seeing the reports of a closed project, but not its card (rule 21).
          const linked = projectLinks === "all" || project.inProgress;
          return (
            <div className="max-w-64 min-w-40 whitespace-normal">
              {linked ? (
                <Link
                  href={`/projects/${project.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {text}
                </Link>
              ) : (
                text
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor("workDescription", {
        enableSorting: false,
        header: t("columns.workDescription"),
        cell: ({ getValue }) => (
          <div className="max-w-64 min-w-40 truncate" title={getValue()}>
            {getValue()}
          </div>
        ),
      }),
      columnHelper.display({
        id: "time",
        header: t("columns.time"),
        cell: ({ row }) =>
          `${formatTime(row.original.startMinute)}–${formatTime(row.original.endMinute)}`,
      }),
      columnHelper.accessor("lunchMinutes", {
        enableSorting: false,
        header: t("columns.lunchMinutes"),
        cell: ({ getValue }) => <div className="text-right">{formatNumber(getValue())}</div>,
      }),
      columnHelper.accessor("workedMinutes", {
        id: "hours",
        header: t("columns.hours"),
        cell: ({ getValue }) => <div className="text-right">{formatHours(getValue())}</div>,
      }),
      columnHelper.accessor("mileageKm", {
        header: t("columns.mileageKm"),
        cell: ({ getValue }) => <div className="text-right">{formatNumber(getValue())}</div>,
      }),
      columnHelper.accessor("status", {
        header: t("columns.status"),
        cell: ({ row }) => (
          <ReportStatusBadge status={row.original.status} unapproval={row.original.unapproval} />
        ),
      }),
      ...(show("updatedAt")
        ? [
            columnHelper.accessor("updatedAt", {
              enableSorting: false,
              header: t("columns.updatedAt"),
              cell: ({ getValue }) => formatDateTime(getValue()) || "—",
            }),
          ]
        : []),
      columnHelper.display({
        id: "actions",
        header: () => <span className="sr-only">{t("list.actionsColumn")}</span>,
        cell: ({ row }) => <ReportRowActions report={row.original} viewer={viewer} />,
      }),
    ]);
  }, [t, tShared, visible, viewer, canApprove, selectable, selected, projectLinks]);

  function approveChosen() {
    startApproving(async () => {
      const result = await approveReports(chosen);
      if (!result.ok) {
        toast.error(tAll(result.error ?? "errors.invalidRequest", result.errorValues));
        return;
      }
      const { approved, skipped } = result;
      const message = skipped > 0 ? "toasts.bulkApprovedSkipped" : "toasts.bulkApproved";
      if (approved > 0) toast.success(t(message, { approved, skipped }));
      else toast.warning(t(message, { approved, skipped }));
      setSelected(new Set());
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {selectable.length > 0 && (
        <div>
          <Button disabled={chosen.length === 0 || isApproving} onClick={approveChosen}>
            <CheckCheckIcon aria-hidden />
            {chosen.length > 0
              ? t("list.approveSelectedCount", { count: chosen.length })
              : t("list.approveSelected")}
          </Button>
        </div>
      )}
      <DataTable
        columns={columns}
        data={rows}
        rowCount={rowCount}
        state={state}
        emptyState={emptyState}
        getRowId={(row) => row.id}
      />
    </div>
  );
}

function ReportRowActions({
  report,
  viewer,
}: {
  report: ReportListItem;
  viewer: Pick<SessionUser, "role">;
}) {
  const t = useTranslations("reports");
  const { run, isPending } = useRunAction();
  const [confirming, setConfirming] = useState(false);
  const actions = availableReportActions(viewer, report);
  const date = formatCalendarDate(report.workDate);

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t("list.rowActions", { date })}>
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto">
          <DropdownMenuItem asChild>
            <Link href={`/reports/${report.id}`}>
              <EyeIcon aria-hidden />
              {t("actions.open")}
            </Link>
          </DropdownMenuItem>
          {actions.edit && (
            <DropdownMenuItem asChild>
              <Link href={`/reports/${report.id}/edit`}>
                <PencilIcon aria-hidden />
                {t("actions.edit")}
              </Link>
            </DropdownMenuItem>
          )}
          {actions.delete && (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
              <Trash2Icon aria-hidden />
              {t("actions.delete")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("actions.deleteTitle", { date, number: report.project.number })}
        description={t("actions.deleteDescription")}
        confirmLabel={t("actions.delete")}
        pending={isPending}
        onConfirm={() =>
          run(() => deleteReport(report.id), "reports.toasts.deleted", {
            onSettled: () => setConfirming(false),
          })
        }
      />
    </>
  );
}
