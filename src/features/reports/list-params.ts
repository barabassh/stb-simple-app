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
  type ReportListScope,
  type ReportSortColumn,
} from "./columns";
import { MAX_MILEAGE_KM } from "./schemas";

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
  mileage: "km",
  mileageFrom: "kmFrom",
  mileageTo: "kmTo",
} as const;

/** Without mileage (0 km), with some, or within a range typed in (docs/ТЗ.md, 7.9). */
export const REPORT_MILEAGE_FILTERS = ["all", "none", "some", "range"] as const;
export type ReportMileageFilter = (typeof REPORT_MILEAGE_FILTERS)[number];

export const REPORT_STATUS_FILTERS = ["unapproved", "approved", "all"] as const;
export type ReportStatusFilter = (typeof REPORT_STATUS_FILTERS)[number];

/** The organisation filter's value for the company's own employees, whose reports have none. */
export const OUR_COMPANY = "company";

/** Every role starts from all statuses (docs/ТЗ.md, 7.9). */
export const DEFAULT_REPORT_STATUS: ReportStatusFilter = "all";

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
  mileage: ReportMileageFilter;
  /** Kilometres, both included; only with the "range" filter, and either may be left empty. */
  mileageFrom: number | null;
  mileageTo: number | null;
};

export type ReportsListParams = ReportFilters & { table: TableState<ReportSortColumn> };

function readDay(searchParams: SearchParamsInput, key: string): string {
  const value = readParam(searchParams, key)?.trim() ?? "";
  return displayDayRange(value) ? value : "";
}

function readKm(searchParams: SearchParamsInput, key: string): number | null {
  const value = readParam(searchParams, key)?.trim() ?? "";
  if (!/^\d{1,4}$/.test(value)) return null;
  const km = Number(value);
  return km <= MAX_MILEAGE_KM ? km : null;
}

const readId = (searchParams: SearchParamsInput, key: string) =>
  readParam(searchParams, key)?.trim() || null;

/**
 * The organisation and the worker are filters of those who see every worker's reports. On a project
 * card the project comes from the page and the organisation is not a filter (docs/ТЗ.md, 7.11).
 */
export function parseReportsListParams(
  searchParams: SearchParamsInput,
  access: ReportAccess,
  scope: ReportListScope = "registry",
): ReportsListParams {
  const status = readParam(searchParams, REPORTS_SEARCH_PARAMS.status);
  const mileage = readParam(searchParams, REPORTS_SEARCH_PARAMS.mileage);
  const registry = scope === "registry";
  const range = mileage === "range";

  return {
    query: readParam(searchParams, REPORTS_SEARCH_PARAMS.query)?.trim() ?? "",
    status: REPORT_STATUS_FILTERS.find((value) => value === status) ?? DEFAULT_REPORT_STATUS,
    projectId: registry ? readId(searchParams, REPORTS_SEARCH_PARAMS.project) : null,
    organization:
      registry && access.all ? readId(searchParams, REPORTS_SEARCH_PARAMS.organization) : null,
    workerId: access.all ? readId(searchParams, REPORTS_SEARCH_PARAMS.worker) : null,
    from: readDay(searchParams, REPORTS_SEARCH_PARAMS.from),
    to: readDay(searchParams, REPORTS_SEARCH_PARAMS.to),
    mileage: REPORT_MILEAGE_FILTERS.find((value) => value === mileage) ?? "all",
    mileageFrom: range ? readKm(searchParams, REPORTS_SEARCH_PARAMS.mileageFrom) : null,
    mileageTo: range ? readKm(searchParams, REPORTS_SEARCH_PARAMS.mileageTo) : null,
    table: parseTableState(searchParams, {
      sortableColumns: reportSortColumns(access, scope),
      defaultSort: DEFAULT_REPORT_SORT,
    }),
  };
}

export function hasReportFilters(params: ReportFilters): boolean {
  return (
    params.query !== "" ||
    params.status !== DEFAULT_REPORT_STATUS ||
    params.projectId !== null ||
    params.organization !== null ||
    params.workerId !== null ||
    params.from !== "" ||
    params.to !== "" ||
    params.mileage !== "all"
  );
}
