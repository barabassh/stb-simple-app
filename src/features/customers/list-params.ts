import {
  parseTableState,
  readParam,
  type SearchParamsInput,
  type TableState,
} from "@/components/data-table/search-params";
import {
  hasReferenceFilters,
  parseReferenceFilters,
  type ReferenceFilters,
} from "@/components/reference-book/list-params";
import { CustomerType } from "@/generated/prisma/enums";

// Read by the registry page and written by its filter bar; the export takes the same parameters
// so that it returns exactly the rows on screen (docs/ТЗ.md, 6.4).

export const CUSTOMER_TYPE_SEARCH_PARAM = "type";

export const CUSTOMER_TYPES = Object.values(CustomerType);

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

export type CustomersListParams = ReferenceFilters & {
  type: CustomerType | null;
  table: TableState<CustomerSortColumn>;
};

export function parseCustomersListParams(searchParams: SearchParamsInput): CustomersListParams {
  const type = readParam(searchParams, CUSTOMER_TYPE_SEARCH_PARAM);

  return {
    ...parseReferenceFilters(searchParams),
    type: CUSTOMER_TYPES.find((value) => value === type) ?? null,
    table: parseTableState(searchParams, {
      sortableColumns: CUSTOMER_SORT_COLUMNS,
      defaultSort: { column: "name", order: "asc" },
    }),
  };
}

export function hasCustomerFilters(params: CustomersListParams): boolean {
  return hasReferenceFilters(params) || params.type !== null;
}
