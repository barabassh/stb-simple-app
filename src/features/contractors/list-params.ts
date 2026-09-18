import {
  parseTableState,
  type SearchParamsInput,
  type TableState,
} from "@/components/data-table/search-params";
import {
  hasReferenceFilters,
  parseReferenceFilters,
  type ReferenceFilters,
} from "@/components/reference-book/list-params";

// Read by the registry page and written by its filter bar; the export takes the same parameters
// so that it returns exactly the rows on screen (docs/ТЗ.md, 6.5).

export const CONTRACTOR_SORT_COLUMNS = [
  "name",
  "kvkNumber",
  "contactPerson",
  "phone",
  "email",
  "city",
  "isActive",
] as const;
export type ContractorSortColumn = (typeof CONTRACTOR_SORT_COLUMNS)[number];

export type ContractorsListParams = ReferenceFilters & {
  table: TableState<ContractorSortColumn>;
};

export function parseContractorsListParams(searchParams: SearchParamsInput): ContractorsListParams {
  return {
    ...parseReferenceFilters(searchParams),
    table: parseTableState(searchParams, {
      sortableColumns: CONTRACTOR_SORT_COLUMNS,
      defaultSort: { column: "name", order: "asc" },
    }),
  };
}

export const hasContractorFilters = hasReferenceFilters;
