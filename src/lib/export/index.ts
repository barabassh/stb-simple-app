import type { SearchParamsInput } from "@/components/data-table/search-params";
import type { AuditEntity } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/session";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import type { Permission } from "@/lib/permissions";

// One description of the columns serves every format: xlsx, pdf and the print view
// (docs/АРХИТЕКТУРА.md, 5).

export const EXPORT_FILE_FORMATS = ["xlsx", "pdf"] as const;
export type ExportFileFormat = (typeof EXPORT_FILE_FORMATS)[number];
export type ExportFormat = ExportFileFormat | "print";

export type ExportColumnFormat = "text" | "number" | "money" | "date" | "datetime";

export type ExportValue = string | number | Date | null;
export type ExportRow = Record<string, ExportValue>;

export type ExportColumn<TRow extends ExportRow = ExportRow> = {
  key: keyof TRow & string;
  /** Already translated. */
  header: string;
  /** In characters; fitted to the longest value when not given. */
  width?: number;
  format?: ExportColumnFormat;
};

export type ExportTable<TRow extends ExportRow = ExportRow> = {
  title: string;
  columns: ExportColumn<TRow>[];
  rows: TRow[];
};

/** Why a report is not made with the given parameters: a translation key and its values. */
export type ExportRefusal = { error: string; errorValues?: Record<string, string> };

/** The export of a section: a new section describes its columns and rows, nothing more. */
export type ExportReport<TRow extends ExportRow = ExportRow> = {
  /** Names the report in links and starts the file name, as in users_14.09.2026.xlsx. */
  name: string;
  /** The list whose search parameters select the rows. */
  path: string;
  permission: Permission;
  /** Written to the EXPORT entry of the audit log. */
  entity: AuditEntity;
  /** Reads every row the list shows with these parameters, in its order, on all of its pages. */
  load: (actor: SessionUser, searchParams: SearchParamsInput) => Promise<ExportTable<TRow>>;
  /** Refuses parameters the report is not made with, such as a period longer than allowed. */
  checkParams?: (searchParams: SearchParamsInput) => ExportRefusal | null;
};

/**
 * Checks the columns of a section against its rows and hands the report on to the code that
 * serves any report. The keys are narrowed to the row type only for that check, so the wider
 * type is safe: every key is still a string and every row still holds export values.
 */
export function defineExportReport<TRow extends ExportRow>(
  report: ExportReport<TRow>,
): ExportReport {
  return report as unknown as ExportReport;
}

export type ExportDocument = ExportTable & {
  /** Without the extension. */
  fileName: string;
  generatedAt: Date;
  /** Already translated texts around the table. */
  labels: {
    generatedAt: string;
    author: string;
    empty: string;
    page: (page: number, pages: number) => string;
  };
};

export function isNumericFormat(format: ExportColumnFormat | undefined): boolean {
  return format === "number" || format === "money";
}

/** A value as text, for the formats that print it: the PDF and the print view. */
export function formatExportValue(
  value: ExportValue | undefined,
  format: ExportColumnFormat = "text",
): string {
  if (value == null) return "";
  if (value instanceof Date) return format === "date" ? formatDate(value) : formatDateTime(value);
  if (typeof value === "number" && isNumericFormat(format)) {
    return format === "money"
      ? formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : formatNumber(value);
  }
  return String(value);
}

const MIN_COLUMN_WIDTH = 8;
const MAX_COLUMN_WIDTH = 50;

function longestLine(text: string): number {
  return Math.max(...text.split("\n").map((line) => line.length));
}

/** Column widths in characters: the given width, or the longest line of the header and values. */
export function exportColumnWidths({ columns, rows }: ExportTable): number[] {
  return columns.map((column) => {
    if (column.width) return column.width;
    const longest = rows.reduce(
      (max, row) => Math.max(max, longestLine(formatExportValue(row[column.key], column.format))),
      longestLine(column.header),
    );
    // A character of padding on each side keeps the longest value off the cell border.
    return Math.min(Math.max(longest + 2, MIN_COLUMN_WIDTH), MAX_COLUMN_WIDTH);
  });
}
