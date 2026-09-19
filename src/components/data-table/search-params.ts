// Shared by the page that queries the data and by the client table that writes the URL,
// so both always agree on the parameter names and their defaults.

export const TABLE_SEARCH_PARAMS = {
  page: "page",
  pageSize: "pageSize",
  sort: "sort",
  order: "order",
} as const;

/** The open tab of a card with tabs, see UrlTabs. */
export const TAB_SEARCH_PARAM = "tab";

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 25;

export type SortOrder = "asc" | "desc";

export type TableSort<TColumn extends string = string> = {
  column: TColumn;
  order: SortOrder;
};

export type TableState<TColumn extends string = string> = {
  page: number;
  pageSize: PageSize;
  sort: TableSort<TColumn> | null;
};

export type SearchParamsInput = Record<string, string | string[] | undefined> | URLSearchParams;

export function readParam(searchParams: SearchParamsInput, key: string): string | undefined {
  if (searchParams instanceof URLSearchParams) return searchParams.get(key) ?? undefined;
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function parsePage(value: string | undefined): number {
  const page = value && /^\d+$/.test(value) ? Number(value) : 0;
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

function parsePageSize(value: string | undefined): PageSize {
  return PAGE_SIZE_OPTIONS.find((size) => String(size) === value) ?? DEFAULT_PAGE_SIZE;
}

/**
 * Link that drops search, filters and page, keeping how the table is sorted and paged, and the
 * parameters in `keep`, such as the open tab of a card.
 */
export function resetFiltersHref(
  pathname: string,
  searchParams: SearchParamsInput,
  keep: readonly string[] = [],
): string {
  const params = new URLSearchParams();
  for (const key of [
    ...keep,
    TABLE_SEARCH_PARAMS.sort,
    TABLE_SEARCH_PARAMS.order,
    TABLE_SEARCH_PARAMS.pageSize,
  ]) {
    const value = readParam(searchParams, key);
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * Reads the table state from the URL. The address can be edited or forwarded by hand,
 * so invalid values fall back to defaults instead of failing, and only whitelisted
 * columns are accepted for sorting.
 */
export function parseTableState<TColumn extends string>(
  searchParams: SearchParamsInput,
  {
    sortableColumns,
    defaultSort = null,
  }: { sortableColumns: readonly TColumn[]; defaultSort?: TableSort<TColumn> | null },
): TableState<TColumn> {
  const column = readParam(searchParams, TABLE_SEARCH_PARAMS.sort);
  const order = readParam(searchParams, TABLE_SEARCH_PARAMS.order);

  const sort: TableSort<TColumn> | null =
    column && sortableColumns.includes(column as TColumn)
      ? { column: column as TColumn, order: order === "desc" ? "desc" : "asc" }
      : defaultSort;

  return {
    page: parsePage(readParam(searchParams, TABLE_SEARCH_PARAMS.page)),
    pageSize: parsePageSize(readParam(searchParams, TABLE_SEARCH_PARAMS.pageSize)),
    sort,
  };
}
