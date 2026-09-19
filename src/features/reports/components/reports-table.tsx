"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { CheckCheckIcon, EllipsisIcon, EyeIcon, PencilIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { ColumnSettings } from "@/components/data-table/column-settings";
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

import { approveReports, deleteReport, saveReportColumns, saveReportColumnSizes } from "../actions";
import {
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  REPORT_COLUMN_WIDTHS,
  REPORT_COLUMNS,
  type ReportColumn,
  type ReportSortColumn,
} from "../columns";
import type { ReportListItem, ReportTableSettings } from "../queries";
import { availableReportActions } from "../report-actions";
import { formatDuration, formatHours, formatTime, weekdayOf } from "../time";
import { ReportStatusBadge } from "./report-status-badge";

const columnHelper = createColumnHelper<DataTableFeatures, ReportListItem>();

const REPORT_COLUMN_IDS: ReadonlySet<string> = new Set(REPORT_COLUMNS);

/** The width a report column starts at, and how far it can be dragged (docs/ТЗ.md, 7.9). */
const width = (column: ReportColumn) => ({
  size: REPORT_COLUMN_WIDTHS[column],
  minSize: MIN_COLUMN_WIDTH,
  maxSize: MAX_COLUMN_WIDTH,
});
const FIXED_WIDTH = { enableResizing: false, minSize: 40 };

type ReportsTableProps = {
  rows: ReportListItem[];
  rowCount: number;
  state: TableState<ReportSortColumn>;
  /** From reportColumns(): the columns the rows were read for. */
  columns: ReportColumn[];
  /** From hideableReportColumns(): offered in the column settings. */
  hideable: ReportColumn[];
  /** The hidden columns and the widths saved in the user's profile. */
  settings: ReportTableSettings;
  emptyState?: React.ReactNode;
  viewer: Pick<SessionUser, "role">;
  /** Whose project cards the reader may open: all, or only those in progress (a contractor). */
  projectLinks: "all" | "inProgress";
};

export function ReportsTable({
  rows,
  rowCount,
  state,
  columns: available,
  hideable,
  settings,
  emptyState,
  viewer,
  projectLinks,
}: ReportsTableProps) {
  const t = useTranslations("reports");
  const tAll = useTranslations();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [isApproving, startApproving] = useTransition();
  const canApprove = can(viewer, "reports.approve");
  const [hiddenNow, setHiddenNow] = useOptimistic(settings.hiddenColumns);
  const [, startSaving] = useTransition();
  const visible = useMemo(
    () => available.filter((column) => !hiddenNow.includes(column)),
    [available, hiddenNow],
  );

  function saveSizes(sizes: Record<string, number>) {
    // A drag past the limit leaves the width beyond it in the table's state, though not on screen.
    const clamped = Object.fromEntries(
      Object.entries(sizes).map(([id, size]) => [
        id,
        Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, size)),
      ]),
    );
    startSaving(async () => {
      const result = await saveReportColumnSizes(clamped);
      if (!result.ok) toast.error(tAll(result.error ?? "errors.invalidRequest"));
    });
  }

  function changeHidden(next: ReportColumn[]) {
    startSaving(async () => {
      setHiddenNow(next);
      const result = await saveReportColumns(next);
      if (!result.ok) toast.error(tAll(result.error ?? "errors.invalidRequest"));
    });
  }

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

    return columnHelper
      .columns([
        ...(canApprove
          ? [
              columnHelper.display({
                id: "select",
                size: 44,
                ...FIXED_WIDTH,
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
          ...width("workDate"),
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
        columnHelper.display({
          id: "weekday",
          ...width("weekday"),
          header: t("columns.weekday"),
          cell: ({ row }) => t(`weekdays.${weekdayOf(row.original.workDate)}`),
        }),
        ...(show("worker")
          ? [
              columnHelper.accessor((row) => row.worker?.nickname, {
                id: "worker",
                ...width("worker"),
                enableSorting: false,
                header: t("columns.worker"),
                // The nickname, with the full name on hover (docs/ТЗ.md, 7.9).
                cell: ({ row }) => (
                  <div
                    className="break-words whitespace-normal"
                    title={row.original.worker?.fullName}
                  >
                    {row.original.worker?.nickname ?? "—"}
                  </div>
                ),
              }),
            ]
          : []),
        ...(show("project")
          ? [
              columnHelper.accessor((row) => row.project.name, {
                id: "project",
                ...width("project"),
                enableSorting: false,
                header: t("columns.project"),
                cell: ({ row }) => {
                  const { project } = row.original;
                  // The name only; the number is on hover (docs/ТЗ.md, 7.9).
                  const text = project.name;
                  // A contractor keeps seeing the reports of a closed project, but not its card (rule 21).
                  const linked = projectLinks === "all" || project.inProgress;
                  return (
                    <div className="break-words whitespace-normal" title={project.number}>
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
            ]
          : []),
        columnHelper.accessor("workDescription", {
          ...width("workDescription"),
          enableSorting: false,
          header: t("columns.workDescription"),
          cell: ({ getValue }) => (
            <div className="truncate" title={getValue()}>
              {getValue()}
            </div>
          ),
        }),
        columnHelper.display({
          id: "time",
          ...width("time"),
          header: t("columns.time"),
          cell: ({ row }) =>
            `${formatTime(row.original.startMinute)}–${formatTime(row.original.endMinute)}`,
        }),
        columnHelper.accessor("lunchMinutes", {
          ...width("lunchMinutes"),
          enableSorting: false,
          header: t("columns.lunchMinutes"),
          cell: ({ getValue }) => <div className="text-right">{formatDuration(getValue())}</div>,
        }),
        columnHelper.accessor("workedMinutes", {
          id: "hours",
          ...width("hours"),
          enableSorting: false,
          header: t("columns.hours"),
          cell: ({ getValue }) => <div className="text-right">{formatHours(getValue())}</div>,
        }),
        columnHelper.accessor("mileageKm", {
          ...width("mileageKm"),
          enableSorting: false,
          header: t("columns.mileageKm"),
          cell: ({ getValue }) => <div className="text-right">{formatNumber(getValue())}</div>,
        }),
        columnHelper.accessor("status", {
          ...width("status"),
          enableSorting: false,
          header: t("columns.status"),
          cell: ({ row }) => (
            <ReportStatusBadge status={row.original.status} unapproval={row.original.unapproval} />
          ),
        }),
        ...(show("updatedAt")
          ? [
              columnHelper.accessor("updatedAt", {
                ...width("updatedAt"),
                enableSorting: false,
                header: t("columns.updatedAt"),
                cell: ({ getValue }) => formatDateTime(getValue()) || "—",
              }),
            ]
          : []),
        columnHelper.display({
          id: "actions",
          size: 56,
          ...FIXED_WIDTH,
          header: () => <span className="sr-only">{t("list.actionsColumn")}</span>,
          cell: ({ row }) => <ReportRowActions report={row.original} viewer={viewer} />,
        }),
        // The ticks and the actions are not report columns and are always shown.
      ])
      .filter((column) => {
        // A column defined by its key has no id of its own: TanStack takes the key.
        const id = column.id ?? ("accessorKey" in column ? String(column.accessorKey) : undefined);
        return !id || !REPORT_COLUMN_IDS.has(id) || visible.includes(id as ReportColumn);
      });
  }, [t, visible, viewer, canApprove, selectable, selected, projectLinks]);

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
      <div className="flex flex-wrap items-center gap-2">
        {selectable.length > 0 && (
          <Button disabled={chosen.length === 0 || isApproving} onClick={approveChosen}>
            <CheckCheckIcon aria-hidden />
            {chosen.length > 0
              ? t("list.approveSelectedCount", { count: chosen.length })
              : t("list.approveSelected")}
          </Button>
        )}
        <div className="ml-auto">
          <ColumnSettings
            columns={hideable
              .filter((column) => available.includes(column))
              .map((column) => ({ id: column, label: t(`columns.${column}`) }))}
            hidden={hiddenNow}
            onChange={changeHidden}
          />
        </div>
      </div>
      <DataTable
        columns={columns}
        data={rows}
        rowCount={rowCount}
        state={state}
        emptyState={emptyState}
        getRowId={(row) => row.id}
        resizing={{ sizes: settings.columnSizes, onSizesChange: saveSizes }}
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
