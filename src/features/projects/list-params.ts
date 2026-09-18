import {
  parseTableState,
  readParam,
  type SearchParamsInput,
  type TableState,
} from "@/components/data-table/search-params";

import {
  DEFAULT_PROJECT_SORT,
  projectSortColumns,
  type ProjectAccess,
  type ProjectSortColumn,
} from "./columns";

// Read by the registry page and written by its filter bar; the export takes the same parameters
// so that it returns exactly the rows on screen (docs/ТЗ.md, 6.8).

export const PROJECTS_SEARCH_PARAMS = {
  query: "q",
  status: "status",
  customer: "customer",
} as const;

export const PROJECT_STATUS_FILTERS = ["inProgress", "closed", "all"] as const;
export type ProjectStatusFilter = (typeof PROJECT_STATUS_FILTERS)[number];

export const DEFAULT_PROJECT_STATUS: ProjectStatusFilter = "inProgress";

export type ProjectsListParams = {
  query: string;
  status: ProjectStatusFilter;
  customerId: string | null;
  table: TableState<ProjectSortColumn>;
};

/**
 * A contractor has no filters: the status and the customer are dropped here for the page, and
 * the query ignores them again for anyone who calls it directly.
 */
export function parseProjectsListParams(
  searchParams: SearchParamsInput,
  access: ProjectAccess,
): ProjectsListParams {
  const status = readParam(searchParams, PROJECTS_SEARCH_PARAMS.status);

  return {
    query: readParam(searchParams, PROJECTS_SEARCH_PARAMS.query)?.trim() ?? "",
    status: access.all
      ? (PROJECT_STATUS_FILTERS.find((value) => value === status) ?? DEFAULT_PROJECT_STATUS)
      : DEFAULT_PROJECT_STATUS,
    customerId: access.all
      ? readParam(searchParams, PROJECTS_SEARCH_PARAMS.customer)?.trim() || null
      : null,
    table: parseTableState(searchParams, {
      sortableColumns: projectSortColumns(access),
      defaultSort: DEFAULT_PROJECT_SORT,
    }),
  };
}

export function hasProjectFilters({ query, status, customerId }: ProjectsListParams): boolean {
  return query !== "" || status !== DEFAULT_PROJECT_STATUS || customerId !== null;
}
