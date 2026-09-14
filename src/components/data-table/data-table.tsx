"use client";

import {
  useTable,
  type PaginationState,
  type RowData,
  type SortDirection,
  type SortingState,
  type TableOptions,
  type Updater,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { DataTablePagination } from "./data-table-pagination";
import { dataTableFeatures, type DataTableFeatures } from "./features";
import { DEFAULT_PAGE_SIZE, TABLE_SEARCH_PARAMS, type TableState } from "./search-params";

export type DataTableProps<TData extends RowData> = {
  columns: TableOptions<DataTableFeatures, TData>["columns"];
  /** Rows of the current page only. */
  data: TData[];
  /** Number of rows matching the filters across all pages. */
  rowCount: number;
  /** Parsed on the server with parseTableState() from the same search params the query used. */
  state: TableState;
  /** Replaces the default text when the page has no rows, e.g. "nothing found" with a reset link. */
  emptyState?: React.ReactNode;
  getRowId?: (row: TData) => string;
};

function resolve<T>(updater: Updater<T>, current: T): T {
  return updater instanceof Function ? updater(current) : updater;
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  rowCount,
  state,
  emptyState,
  getRowId,
}: DataTableProps<TData>) {
  const t = useTranslations("dataTable");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Controlled state is synchronised into the table store, so it must keep its identity between renders.
  const sortColumn = state.sort?.column;
  const sortOrder = state.sort?.order;
  const sorting = useMemo<SortingState>(
    () => (sortColumn ? [{ id: sortColumn, desc: sortOrder === "desc" }] : []),
    [sortColumn, sortOrder],
  );
  const pagination = useMemo<PaginationState>(
    () => ({ pageIndex: state.page - 1, pageSize: state.pageSize }),
    [state.page, state.pageSize],
  );

  function navigate(changes: Record<string, string | null>) {
    // Search and filter parameters belong to the page, so they are carried over untouched.
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    startTransition(() =>
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false }),
    );
  }

  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
    getRowId,
    rowCount,
    state: { sorting, pagination },
    manualPagination: true,
    manualSorting: true,
    enableMultiSort: false,
    // With a default sort, removing the sort brings the same column back sorted and the header
    // would look stuck, so a sorted column only switches direction.
    enableSortingRemoval: false,
    onSortingChange: (updater) => {
      const [next] = resolve(updater, sorting);
      navigate({
        [TABLE_SEARCH_PARAMS.sort]: next ? next.id : null,
        [TABLE_SEARCH_PARAMS.order]: next ? (next.desc ? "desc" : "asc") : null,
        [TABLE_SEARCH_PARAMS.page]: null,
      });
    },
    onPaginationChange: (updater) => {
      const next = resolve(updater, pagination);
      const firstPage = next.pageSize !== pagination.pageSize || next.pageIndex === 0;
      navigate({
        [TABLE_SEARCH_PARAMS.pageSize]:
          next.pageSize === DEFAULT_PAGE_SIZE ? null : String(next.pageSize),
        [TABLE_SEARCH_PARAMS.page]: firstPage ? null : String(next.pageIndex + 1),
      });
    },
  });

  const rows = table.getRowModel().rows;

  return (
    <div className="flex flex-col gap-3">
      <div
        aria-busy={isPending}
        className={cn(
          "overflow-hidden rounded-xl border transition-opacity",
          isPending && "opacity-60",
        )}
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();

                  return (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      aria-sort={
                        sorted === "asc"
                          ? "ascending"
                          : sorted === "desc"
                            ? "descending"
                            : undefined
                      }
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="-ml-2.5"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <table.FlexRender header={header} />
                          <SortIcon sorted={sorted} />
                        </Button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={table.getAllLeafColumns().length}
                  className="h-32 text-center whitespace-normal text-muted-foreground"
                >
                  {emptyState ?? t("empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <DataTablePagination table={table} rowCount={rowCount} rowsOnPage={rows.length} />
    </div>
  );
}

function SortIcon({ sorted }: { sorted: false | SortDirection }) {
  if (sorted === "asc") return <ArrowUpIcon aria-hidden />;
  if (sorted === "desc") return <ArrowDownIcon aria-hidden />;
  return <ChevronsUpDownIcon className="text-muted-foreground" aria-hidden />;
}
