"use client";

import type { ReactTable, RowData } from "@tanstack/react-table";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatNumber } from "@/lib/format";

import type { DataTableFeatures } from "./features";
import { PAGE_SIZE_OPTIONS } from "./search-params";

type DataTablePaginationProps<TData extends RowData> = {
  table: ReactTable<DataTableFeatures, TData>;
  rowCount: number;
  rowsOnPage: number;
};

export function DataTablePagination<TData extends RowData>({
  table,
  rowCount,
  rowsOnPage,
}: DataTablePaginationProps<TData>) {
  const t = useTranslations("dataTable");
  const pageSizeId = useId();
  const { pageIndex, pageSize } = table.state.pagination;

  // Counted from the rows actually received: a page number past the end yields an empty page.
  const from = rowsOnPage > 0 ? pageIndex * pageSize + 1 : 0;
  const to = rowsOnPage > 0 ? from + rowsOnPage - 1 : 0;
  const pageCount = Math.max(1, table.getPageCount());

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 text-sm">
      <p className="text-muted-foreground tabular-nums">
        {t("range", {
          from: formatNumber(from),
          to: formatNumber(to),
          total: formatNumber(rowCount),
        })}
      </p>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <Label htmlFor={pageSizeId} className="font-normal">
            {t("rowsPerPage")}
          </Label>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => table.setPageSize(Number(value))}
          >
            <SelectTrigger id={pageSizeId} size="sm" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="tabular-nums">
          {t("page", { page: formatNumber(pageIndex + 1), pages: formatNumber(pageCount) })}
        </p>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("firstPage")}
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.firstPage()}
          >
            <ChevronsLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("previousPage")}
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("nextPage")}
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            <ChevronRightIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("lastPage")}
            disabled={!table.getCanLastPage()}
            onClick={() => table.lastPage()}
          >
            <ChevronsRightIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}
