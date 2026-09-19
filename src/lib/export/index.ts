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

/** "decimal" always has two decimals, as hours do on screen; "money" is the same for sums. */
export type ExportColumnFormat = "text" | "number" | "decimal" | "money" | "date" | "datetime";

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
  /**
   * The last row, "Итого": values of some of the columns, summed by the query that read the rows
   * (the export does not know which columns add up). The label takes the first column without one.
   */
  totals?: Partial<TRow>;
};

/** What a report reads for a file: everything but the columns, which are described apart. */
export type ExportData<TRow extends ExportRow = ExportRow> = Omit<ExportTable<TRow>, "columns">;

/**
 * PDF and the print view are laid out whole in the memory of one request, so they take at most so
 * many rows; a spreadsheet is written row by row and has no limit (docs/ТЗ.md, 4.11).
 */
export const PRINT_ROW_LIMIT = 2000;

export function isRowLimited(format: ExportFormat): boolean {
  return format !== "xlsx";
}

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
  /**
   * Every column the user may export, in the file's order. Described apart from the rows, so that
   * the user chooses among them before anything is read (docs/ТЗ.md, 4.11).
   */
  columns: (actor: SessionUser) => Promise<ExportColumn<TRow>[]>;
  /** Reads every row the list shows with these parameters, in its order, on all of its pages. */
  load: (actor: SessionUser, searchParams: SearchParamsInput) => Promise<ExportData<TRow>>;
  /** How many rows load() would read, counted before reading them for the row limit. */
  count: (actor: SessionUser, searchParams: SearchParamsInput) => Promise<number>;
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
    totals: string;
    page: (page: number, pages: number) => string;
  };
};

export function isNumericFormat(format: ExportColumnFormat | undefined): boolean {
  return format === "number" || format === "decimal" || format === "money";
}

/** A value as text, for the formats that print it: the PDF and the print view. */
export function formatExportValue(
  value: ExportValue | undefined,
  format: ExportColumnFormat = "text",
): string {
  if (value == null) return "";
  if (value instanceof Date) return format === "date" ? formatDate(value) : formatDateTime(value);
  if (typeof value === "number" && isNumericFormat(format)) {
    return format === "money" || format === "decimal"
      ? formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : formatNumber(value);
  }
  return String(value);
}

/**
 * The columns chosen for the file, in the order the parameter names them, or all of them in the
 * report's order when it names none the report has. Unknown and repeated names are ignored, as an
 * old or edited link may hold some.
 */
export function chooseColumns<TColumn extends { key: string }>(
  columns: TColumn[],
  chosen: readonly string[] | null,
): TColumn[] {
  if (!chosen) return columns;
  const kept = [...new Set(chosen)].flatMap((key) =>
    columns.filter((column) => column.key === key),
  );
  return kept.length > 0 ? kept : columns;
}

/**
 * The "Итого" row as every format writes it, or null when the report has none. The label takes the
 * first column without a sum: the user may have put a summed column first (docs/ТЗ.md, 4.11).
 */
export function totalsRow({ columns, totals, labels }: ExportDocument): Partial<ExportRow> | null {
  if (!totals) return null;
  const free = columns.find((column) => totals[column.key] == null);
  return free ? { ...totals, [free.key]: labels.totals } : totals;
}

const MIN_COLUMN_WIDTH = 8;
const MAX_COLUMN_WIDTH = 50;

function longestLine(text: string): number {
  return Math.max(...text.split("\n").map((line) => line.length));
}

/** Column widths in characters: the given width, or the longest line of the header and values. */
export function exportColumnWidths({ columns, rows, totals }: ExportTable): number[] {
  return columns.map((column) => {
    if (column.width) return column.width;
    const longest = [...rows, ...(totals ? [totals] : [])].reduce(
      (max, row) => Math.max(max, longestLine(formatExportValue(row[column.key], column.format))),
      longestLine(column.header),
    );
    // A character of padding on each side keeps the longest value off the cell border.
    return Math.min(Math.max(longest + 2, MIN_COLUMN_WIDTH), MAX_COLUMN_WIDTH);
  });
}
