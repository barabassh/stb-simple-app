"use client";

import {
  createColumnHelper,
  useTable,
  type ColumnSizingState,
  type columnResizingState,
  type PaginationState,
  type RowData,
  type SortDirection,
  type SortingState,
  type TableOptions,
  type Updater,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon, ChevronsUpDownIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";

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
  /** Adds a toggle to every row that opens this content in a full-width row beneath it. */
  renderRowDetails?: (row: TData) => React.ReactNode;
  /**
   * Lets the user drag the right edge of a column header to change its width; a double click
   * returns the column to the `size` of its definition. `sizes` are the widths saved earlier, and
   * `onSizesChange` gets them all when a drag ends. The table then lays out by these widths.
   */
  resizing?: {
    sizes: ColumnSizingState;
    onSizesChange: (sizes: ColumnSizingState) => void;
  };
};

function roundSizes(sizes: ColumnSizingState): ColumnSizingState {
  return Object.fromEntries(Object.entries(sizes).map(([id, size]) => [id, Math.round(size)]));
}

const NOT_RESIZING: columnResizingState = {
  columnSizingStart: [],
  deltaOffset: null,
  deltaPercentage: null,
  isResizingColumn: false,
  startOffset: null,
  startSize: null,
};

const DETAILS_COLUMN_ID = "details";

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
  renderRowDetails,
  resizing,
}: DataTableProps<TData>) {
  const t = useTranslations("dataTable");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(resizing?.sizes ?? {});
  const [columnResizing, setColumnResizing] = useState<columnResizingState>(NOT_RESIZING);
  const resizable = resizing !== undefined;

  // The widths are handed on once, when the user lets go of the edge, not on every pixel.
  const onSizesChange = useRef(resizing?.onSizesChange);
  onSizesChange.current = resizing?.onSizesChange;
  const wasResizing = useRef(false);
  // A click on the edge without moving it ends a "drag" too; nothing changed, so nothing is saved.
  const saved = useRef(JSON.stringify(roundSizes(resizing?.sizes ?? {})));
  const handOn = (sizes: ColumnSizingState) => {
    const json = JSON.stringify(sizes);
    if (json === saved.current) return;
    saved.current = json;
    onSizesChange.current?.(sizes);
  };
  useEffect(() => {
    const now = columnResizing.isResizingColumn !== false;
    // A drag leaves fractions of a pixel; widths are kept in whole pixels.
    if (wasResizing.current && !now) handOn(roundSizes(columnSizing));
    wasResizing.current = now;
  });

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

  // Depends on whether details exist, not on the render function, which is usually an inline arrow.
  const hasDetails = renderRowDetails !== undefined;
  const tableColumns = useMemo(() => {
    if (!hasDetails) return columns;
    const detailsColumn = createColumnHelper<DataTableFeatures, TData>().display({
      id: DETAILS_COLUMN_ID,
      header: () => <span className="sr-only">{t("details")}</span>,
      cell: ({ row }) => {
        const expanded = row.getIsExpanded();
        return (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-expanded={expanded}
            aria-label={t(expanded ? "hideDetails" : "showDetails")}
            onClick={() => row.toggleExpanded()}
          >
            <ChevronRightIcon className={cn("transition-transform", expanded && "rotate-90")} />
          </Button>
        );
      },
    });
    return [detailsColumn, ...columns];
  }, [columns, hasDetails, t]);

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
    columns: tableColumns,
    getRowId,
    rowCount,
    state: { sorting, pagination, columnSizing, columnResizing },
    enableColumnResizing: resizable,
    columnResizeMode: "onChange",
    onColumnSizingChange: (updater) => setColumnSizing((current) => resolve(updater, current)),
    onColumnResizingChange: (updater) => setColumnResizing((current) => resolve(updater, current)),
    manualPagination: true,
    manualSorting: true,
    enableMultiSort: false,
    // With a default sort, removing the sort brings the same column back sorted and the header
    // would look stuck, so a sorted column only switches direction.
    enableSortingRemoval: false,
    getRowCanExpand: () => hasDetails,
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
  const columnCount = table.getAllLeafColumns().length;

  function resetWidth(columnId: string) {
    const rest = Object.fromEntries(Object.entries(columnSizing).filter(([id]) => id !== columnId));
    setColumnSizing(rest);
    handOn(roundSizes(rest));
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        aria-busy={isPending}
        className={cn(
          "overflow-hidden rounded-xl border transition-opacity",
          isPending && "opacity-60",
        )}
      >
        <Table
          // A fixed layout keeps each column at its width; the table still fills a wider block.
          style={
            resizable
              ? { tableLayout: "fixed", width: table.getTotalSize(), minWidth: "100%" }
              : undefined
          }
        >
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();

                  return (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      className={cn(
                        header.column.id === DETAILS_COLUMN_ID && "w-0",
                        resizable && "relative overflow-hidden text-ellipsis",
                      )}
                      style={resizable ? { width: header.getSize() } : undefined}
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
                      {resizable && header.column.getCanResize() && (
                        <div
                          aria-hidden
                          onMouseDown={(event) => {
                            // The second press of a double click resets the width instead of
                            // starting a drag, whose end would write the old width back.
                            if (event.detail >= 2) resetWidth(header.column.id);
                            else header.getResizeHandler()(event);
                          }}
                          onTouchStart={header.getResizeHandler()}
                          title={t("resizeColumn")}
                          className={cn(
                            "absolute top-0 right-0 h-full w-2 cursor-col-resize touch-none select-none",
                            "after:absolute after:top-1/4 after:right-0 after:h-1/2 after:w-px after:bg-border hover:after:w-0.5 hover:after:bg-filter-active",
                            header.column.getIsResizing() && "after:w-0.5 after:bg-filter-active",
                          )}
                        />
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
                <Fragment key={row.id}>
                  <TableRow>
                    {row.getAllCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(resizable && "overflow-hidden text-ellipsis")}
                      >
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                  {renderRowDetails && row.getIsExpanded() && (
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={columnCount} className="whitespace-normal">
                        {renderRowDetails(row.original)}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={columnCount}
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
