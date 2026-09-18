import { readParam, type SearchParamsInput } from "@/components/data-table/search-params";

// The registries of customers and contractors (docs/ТЗ.md, 6.4–6.5) search one line and filter by
// status the same way; read by the page and the export, written by the filter bar.

/** The sections built as a reference book: their messages, routes and permissions share a name. */
export type ReferenceSection = "customers" | "contractors";

export const REFERENCE_SEARCH_PARAMS = {
  query: "q",
  status: "status",
} as const;

export const REFERENCE_STATUS_FILTERS = ["active", "archived", "all"] as const;
export type ReferenceStatusFilter = (typeof REFERENCE_STATUS_FILTERS)[number];

/** Archived records are kept for what references them, so they are hidden by default. */
export const DEFAULT_REFERENCE_STATUS: ReferenceStatusFilter = "active";

export type ReferenceFilters = { query: string; status: ReferenceStatusFilter };

export function parseReferenceFilters(searchParams: SearchParamsInput): ReferenceFilters {
  const status = readParam(searchParams, REFERENCE_SEARCH_PARAMS.status);

  return {
    query: readParam(searchParams, REFERENCE_SEARCH_PARAMS.query)?.trim() ?? "",
    status: REFERENCE_STATUS_FILTERS.find((value) => value === status) ?? DEFAULT_REFERENCE_STATUS,
  };
}

export function hasReferenceFilters({ query, status }: ReferenceFilters): boolean {
  return query !== "" || status !== DEFAULT_REFERENCE_STATUS;
}

/** The part of a Prisma `where` for the status filter and the one-line search over `fields`. */
export function referenceWhere<TField extends string>(
  { query, status }: ReferenceFilters,
  fields: readonly TField[],
) {
  return {
    ...(status !== "all" ? { isActive: status === "active" } : {}),
    ...(query
      ? {
          OR: fields.map(
            (field) =>
              ({ [field]: { contains: query, mode: "insensitive" } }) as {
                [K in TField]?: { contains: string; mode: "insensitive" };
              },
          ),
        }
      : {}),
  };
}
