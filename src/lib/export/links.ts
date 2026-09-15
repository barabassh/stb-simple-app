import { TABLE_SEARCH_PARAMS, type SearchParamsInput } from "@/components/data-table/search-params";

import type { ExportFileFormat } from ".";

/** Names the report in a file link; the other parameters are the search parameters of its list. */
export const EXPORT_REPORT_PARAM = "report";

/** The page is left out: an export takes every row matching the filters, in the same order. */
function listSearchParams(searchParams: SearchParamsInput): URLSearchParams {
  const params = new URLSearchParams();
  const entries =
    searchParams instanceof URLSearchParams
      ? [...searchParams]
      : Object.entries(searchParams).flatMap(([key, value]) =>
          [value ?? []].flat().map((item) => [key, item] as const),
        );

  for (const [key, value] of entries) params.append(key, value);
  for (const key of [TABLE_SEARCH_PARAMS.page, TABLE_SEARCH_PARAMS.pageSize, EXPORT_REPORT_PARAM]) {
    params.delete(key);
  }
  return params;
}

function withQuery(path: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function exportFileHref(
  report: string,
  format: ExportFileFormat,
  searchParams: SearchParamsInput,
): string {
  return withQuery(
    `/api/export/${format}`,
    new URLSearchParams([[EXPORT_REPORT_PARAM, report], ...listSearchParams(searchParams)]),
  );
}

export function printHref(report: string, searchParams: SearchParamsInput): string {
  return withQuery(`/print/${report}`, listSearchParams(searchParams));
}

/** The list a report was made from, with the same filters: the way back from the print view. */
export function listHref(path: string, searchParams: SearchParamsInput): string {
  return withQuery(path, listSearchParams(searchParams));
}
