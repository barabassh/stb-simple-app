import type { SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";

// What a role sees of the reports (docs/ТЗ.md, 7.9): the query, the registry and, later, the export
// take their columns from here, so the screen cannot show a column the query did not read.

export type ReportAccess = {
  /** reports.read: every worker's reports, with the worker, the organisation and the stamps. */
  all: boolean;
};

export function reportAccess(user: Pick<SessionUser, "role">): ReportAccess {
  return { all: can(user, "reports.read") };
}

export const REPORT_COLUMNS = [
  "workDate",
  "worker",
  "organization",
  "project",
  "workDescription",
  "time",
  "lunchMinutes",
  "hours",
  "mileageKm",
  "status",
  "updatedAt",
] as const;
export type ReportColumn = (typeof REPORT_COLUMNS)[number];

const ALL_ONLY: readonly ReportColumn[] = ["worker", "organization", "updatedAt"];

const SORTABLE = ["workDate", "worker", "project", "hours", "mileageKm", "status"] as const;
export type ReportSortColumn = (typeof SORTABLE)[number];

/** The newest day first, and within a day by the start of work (docs/ТЗ.md, 7.9). */
export const DEFAULT_REPORT_SORT = { column: "workDate", order: "desc" } as const satisfies {
  column: ReportSortColumn;
  order: "asc" | "desc";
};

export function reportColumns(access: ReportAccess): ReportColumn[] {
  return REPORT_COLUMNS.filter((column) => access.all || !ALL_ONLY.includes(column));
}

/** Sorting by the worker is offered only to those who see the column. */
export function reportSortColumns(access: ReportAccess): ReportSortColumn[] {
  const visible = reportColumns(access);
  return SORTABLE.filter((column) => visible.includes(column));
}
