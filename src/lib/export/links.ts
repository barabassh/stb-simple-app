import {
  readParam,
  TABLE_SEARCH_PARAMS,
  type SearchParamsInput,
} from "@/components/data-table/search-params";

import type { ExportFileFormat } from ".";

/** Names the report in a file link; the other parameters are the search parameters of its list. */
export const EXPORT_REPORT_PARAM = "report";
/** The columns chosen for the file, comma-separated; all of them when absent. */
export const EXPORT_COLUMNS_PARAM = "columns";

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
  for (const key of [
    TABLE_SEARCH_PARAMS.page,
    TABLE_SEARCH_PARAMS.pageSize,
    EXPORT_REPORT_PARAM,
    EXPORT_COLUMNS_PARAM,
  ]) {
    params.delete(key);
  }
  return params;
}

function withQuery(path: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function readExportColumns(searchParams: SearchParamsInput): string[] | null {
  const value = readParam(searchParams, EXPORT_COLUMNS_PARAM)?.trim();
  return value ? value.split(",").filter(Boolean) : null;
}

/** An export link with the chosen columns; without the parameter when every column is chosen. */
export function withExportColumns(href: string, chosen: readonly string[] | null): string {
  if (!chosen) return href;
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set(EXPORT_COLUMNS_PARAM, chosen.join(","));
  return `${path}?${params}`;
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
