import {
  parseTableState,
  readParam,
  type SearchParamsInput,
  type TableState,
} from "@/components/data-table/search-params";
import { displayDayRange } from "@/lib/format";

import {
  DEFAULT_REPORT_SORT,
  reportSortColumns,
  type ReportAccess,
  type ReportSortColumn,
} from "./columns";

// Read by the registry page and written by its filter bar. The filters are only a narrowing:
// whose reports a user may see is decided by the query, whatever the URL says
// (docs/ПРАВА-ДОСТУПА.md, rule 16).

export const REPORTS_SEARCH_PARAMS = {
  query: "q",
  status: "status",
  project: "project",
  organization: "org",
  worker: "worker",
  from: "from",
  to: "to",
} as const;

export const REPORT_STATUS_FILTERS = ["unapproved", "approved", "all"] as const;
export type ReportStatusFilter = (typeof REPORT_STATUS_FILTERS)[number];

/** The organisation filter's value for the company's own employees, whose reports have none. */
export const OUR_COMPANY = "company";

/** Administrators and managers start from the queue of reports to approve (docs/ТЗ.md, 7.9). */
export function defaultReportStatus(access: ReportAccess): ReportStatusFilter {
  return access.all ? "unapproved" : "all";
}

export type ReportFilters = {
  query: string;
  status: ReportStatusFilter;
  projectId: string | null;
  /** A contractor id, or OUR_COMPANY. */
  organization: string | null;
  workerId: string | null;
  /** Calendar days as `yyyy-MM-dd`, both included; empty when not set. */
  from: string;
  to: string;
};

export type ReportsListParams = ReportFilters & { table: TableState<ReportSortColumn> };

function readDay(searchParams: SearchParamsInput, key: string): string {
  const value = readParam(searchParams, key)?.trim() ?? "";
  return displayDayRange(value) ? value : "";
}

const readId = (searchParams: SearchParamsInput, key: string) =>
  readParam(searchParams, key)?.trim() || null;

/** The organisation and the worker are filters of those who see every worker's reports. */
export function parseReportsListParams(
  searchParams: SearchParamsInput,
  access: ReportAccess,
): ReportsListParams {
  const status = readParam(searchParams, REPORTS_SEARCH_PARAMS.status);

  return {
    query: readParam(searchParams, REPORTS_SEARCH_PARAMS.query)?.trim() ?? "",
    status: REPORT_STATUS_FILTERS.find((value) => value === status) ?? defaultReportStatus(access),
    projectId: readId(searchParams, REPORTS_SEARCH_PARAMS.project),
    organization: access.all ? readId(searchParams, REPORTS_SEARCH_PARAMS.organization) : null,
    workerId: access.all ? readId(searchParams, REPORTS_SEARCH_PARAMS.worker) : null,
    from: readDay(searchParams, REPORTS_SEARCH_PARAMS.from),
    to: readDay(searchParams, REPORTS_SEARCH_PARAMS.to),
    table: parseTableState(searchParams, {
      sortableColumns: reportSortColumns(access),
      defaultSort: DEFAULT_REPORT_SORT,
    }),
  };
}

export function hasReportFilters(params: ReportFilters, access: ReportAccess): boolean {
  return (
    params.query !== "" ||
    params.status !== defaultReportStatus(access) ||
    params.projectId !== null ||
    params.organization !== null ||
    params.workerId !== null ||
    params.from !== "" ||
    params.to !== ""
  );
}
