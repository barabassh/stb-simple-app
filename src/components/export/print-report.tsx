import { ArrowLeftIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import {
  formatExportValue,
  isNumericFormat,
  type ExportColumnFormat,
  type ExportDocument,
} from "@/lib/export";
import { cn } from "@/lib/utils";

import { PrintButton } from "./print-button";

// Kept to this view, so that printing any other page is left to the browser's defaults.
const PAGE_RULE = "@page { size: A4 landscape; margin: 10mm; }";

/** Dates and numbers stay on one line; other values wrap, so that no column is cut off. */
function cellClassName(format: ExportColumnFormat | undefined) {
  const oneLine = format === "date" || format === "datetime" || isNumericFormat(format);
  return cn(
    "border px-2 py-1 align-top",
    oneLine ? "whitespace-nowrap" : "break-words whitespace-pre-line",
    isNumericFormat(format) && "text-right tabular-nums",
  );
}

type PrintReportProps = {
  content: ExportDocument;
  backHref: string;
};

export async function PrintReport({ content, backHref }: PrintReportProps) {
  const t = await getTranslations("export");
  const { title, columns, rows, labels } = content;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 print:p-0">
      <style>{PAGE_RULE}</style>

      <div className="flex flex-wrap gap-2 print:hidden">
        <Button variant="outline" asChild>
          <a href={backHref}>
            <ArrowLeftIcon aria-hidden />
            {t("back")}
          </a>
        </Button>
        <PrintButton label={t("printNow")} />
      </div>

      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold print:text-base">{title}</h1>
        <p className="text-sm text-muted-foreground print:text-xs">
          {labels.generatedAt} · {labels.author}
        </p>
      </header>

      {/* On screen a wide table scrolls in its block; on paper it is fitted to the sheet. */}
      <div className="overflow-x-auto print:overflow-visible">
        {/* A browser repeats <thead> at the top of every printed page. */}
        <table className="w-full border-collapse text-sm print:text-[8pt]">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "border bg-muted px-2 py-1 text-left align-bottom font-semibold print:bg-transparent",
                    isNumericFormat(column.format) && "text-right",
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="border px-2 py-6 text-center text-muted-foreground"
                >
                  {labels.empty}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={index} className="break-inside-avoid">
                  {columns.map((column) => (
                    <td key={column.key} className={cellClassName(column.format)}>
                      {formatExportValue(row[column.key], column.format)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
