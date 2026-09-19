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

/** The status comes first, as an icon (docs/ТЗ.md, 7.9). */
export const REPORT_COLUMNS = [
  "status",
  "workDate",
  "weekday",
  "worker",
  "project",
  "workDescription",
  "time",
  "lunchMinutes",
  "hours",
  "mileageKm",
  "updatedAt",
] as const;
export type ReportColumn = (typeof REPORT_COLUMNS)[number];

const ALL_ONLY: readonly ReportColumn[] = ["worker", "updatedAt"];

/**
 * Widths in pixels the columns start at, and the range the user may drag them within
 * (docs/ТЗ.md, 7.9). The ticks and the actions keep their width.
 */
export const REPORT_COLUMN_WIDTHS: Record<ReportColumn, number> = {
  // Measured by their content, so that every column of a manager fits from 1440px on; the project
  // and the work wrap onto as many lines as they take.
  status: 80,
  workDate: 110,
  weekday: 120,
  worker: 100,
  project: 150,
  workDescription: 180,
  time: 118,
  lunchMinutes: 64,
  hours: 64,
  mileageKm: 100,
  updatedAt: 145,
};
export const MIN_COLUMN_WIDTH = 60;
export const MAX_COLUMN_WIDTH = 800;

/** The table sorts by the date only (docs/ТЗ.md, 7.9). */
const SORTABLE = ["workDate"] as const;
export type ReportSortColumn = (typeof SORTABLE)[number];

/** The newest day first, and within a day by the start of work (docs/ТЗ.md, 7.9). */
export const DEFAULT_REPORT_SORT = { column: "workDate", order: "desc" } as const satisfies {
  column: ReportSortColumn;
  order: "asc" | "desc";
};

/**
 * The registry lists reports of every project; the "Отчёты" tab of a project card lists those of
 * the project it is on, so the project is neither a column nor a filter there (docs/ТЗ.md, 7.11).
 */
export type ReportListScope = "registry" | "project";

export function reportColumns(
  access: ReportAccess,
  scope: ReportListScope = "registry",
): ReportColumn[] {
  return REPORT_COLUMNS.filter(
    (column) =>
      (access.all || !ALL_ONLY.includes(column)) && (scope === "registry" || column !== "project"),
  );
}

/**
 * The columns a user may hide in the column settings: the date opens the report, so it stays.
 * Hidden columns are left out of what reportColumns() offers, never added to it.
 */
export function hideableReportColumns(
  access: ReportAccess,
  scope: ReportListScope = "registry",
): ReportColumn[] {
  return reportColumns(access, scope).filter((column) => column !== "workDate");
}

export function reportSortColumns(
  access: ReportAccess,
  scope: ReportListScope = "registry",
): ReportSortColumn[] {
  const visible = reportColumns(access, scope);
  return SORTABLE.filter((column) => visible.includes(column));
}
