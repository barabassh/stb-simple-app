import {
  parseTableState,
  readParam,
  type SearchParamsInput,
  type TableState,
} from "@/components/data-table/search-params";
import { CustomerType } from "@/generated/prisma/enums";

// Read by the registry page and written by its filter bar; the export takes the same parameters
// so that it returns exactly the rows on screen (docs/ТЗ.md, 6.4).

export const CUSTOMERS_SEARCH_PARAMS = {
  query: "q",
  type: "type",
  status: "status",
} as const;

export const CUSTOMER_TYPES = Object.values(CustomerType);

export const CUSTOMER_STATUS_FILTERS = ["active", "archived", "all"] as const;
export type CustomerStatusFilter = (typeof CUSTOMER_STATUS_FILTERS)[number];

/** Archived customers are kept for the projects that reference them, so they are hidden by default. */
export const DEFAULT_CUSTOMER_STATUS: CustomerStatusFilter = "active";

export const CUSTOMER_SORT_COLUMNS = [
  "name",
  "type",
  "kvkNumber",
  "contactPerson",
  "phone",
  "email",
  "city",
  "isActive",
] as const;
export type CustomerSortColumn = (typeof CUSTOMER_SORT_COLUMNS)[number];

export type CustomersListParams = {
  query: string;
  type: CustomerType | null;
  status: CustomerStatusFilter;
  table: TableState<CustomerSortColumn>;
};

export function parseCustomersListParams(searchParams: SearchParamsInput): CustomersListParams {
  const type = readParam(searchParams, CUSTOMERS_SEARCH_PARAMS.type);
  const status = readParam(searchParams, CUSTOMERS_SEARCH_PARAMS.status);

  return {
    query: readParam(searchParams, CUSTOMERS_SEARCH_PARAMS.query)?.trim() ?? "",
    type: CUSTOMER_TYPES.find((value) => value === type) ?? null,
    status: CUSTOMER_STATUS_FILTERS.find((value) => value === status) ?? DEFAULT_CUSTOMER_STATUS,
    table: parseTableState(searchParams, {
      sortableColumns: CUSTOMER_SORT_COLUMNS,
      defaultSort: { column: "name", order: "asc" },
    }),
  };
}

export function hasCustomerFilters({ query, type, status }: CustomersListParams): boolean {
  return query !== "" || type !== null || status !== DEFAULT_CUSTOMER_STATUS;
}
