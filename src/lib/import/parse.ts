import ExcelJS from "exceljs";

import { formatCalendarDate } from "@/lib/format";

import {
  importFailure,
  MAX_IMPORT_ROWS,
  type ImportColumn,
  type ImportColumnType,
  type ImportFailure,
  type ImportRow,
  type ParsedRow,
} from ".";

// Reads the first sheet of an .xlsx file: the columns are found by their headings in the first
// row, in any order, and any other column is left unread (docs/АРХИТЕКТУРА.md, 3.11). Cells of
// dates, of times and of text are brought to one form, so that the rules of the form check the
// rows of a file exactly as they check the form.

const MINUTES_PER_DAY = 24 * 60;

const message = (key: string) => `import.cells.${key}`;

/** Headings are matched with their case and their extra spaces ignored. */
function normalizeHeader(header: string): string {
  return header.replace(/\s+/g, " ").trim().toLowerCase();
}

type CellContent = { date: Date } | { number: number } | { text: string } | null;

const asText = (value: string): CellContent =>
  value.trim() === "" ? null : { text: value.trim() };

/**
 * What is written in a cell: a date, a number or text. A formula gives its result, rich text and a
 * hyperlink their text, and an error cell the code Excel shows, so that the preview shows the file.
 */
function cellContent(value: ExcelJS.CellValue): CellContent {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return { date: value };
  if (typeof value === "number") return { number: value };
  if (typeof value === "boolean") return asText(String(value));
  if (typeof value === "string") return asText(value);
  if (typeof value === "object") {
    if ("richText" in value) return asText(value.richText.map((part) => part.text).join(""));
    if ("formula" in value || "sharedFormula" in value) {
      return cellContent((value as ExcelJS.CellFormulaValue).result ?? null);
    }
    if ("error" in value) return asText(String(value.error));
    if ("text" in value) return asText(String(value.text));
  }
  return asText(String(value));
}

/** A date cell holds the day as midnight UTC; a whole day is what a date column keeps of it. */
function isoDateOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Minutes from midnight of a date cell, rounded to the minute: 08:29:59.999 is 08:30. */
function minutesOf(date: Date): number {
  const seconds = date.getUTCSeconds() + date.getUTCMilliseconds() / 1000;
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes() + (seconds >= 30 ? 1 : 0);
  return Math.min(minutes, MINUTES_PER_DAY - 1);
}

const formatMinutes = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const dateText = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const timeText = /^(\d{1,2}):([0-5]\d)$/;

/** "18.09.2026" → "2026-09-18"; a day that is not in its month is not a date. */
function parseDateText(value: string): string | null {
  const match = dateText.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  const isoDate = `${year}-${month}-${day}`;
  const date = new Date(`${isoDate}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && isoDateOf(date) === isoDate ? isoDate : null;
}

function parseTimeText(value: string): string | null {
  const match = timeText.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  return hours < 24 ? `${String(hours).padStart(2, "0")}:${match[2]}` : null;
}

type CellValue = { value: string } | { value: string; error: string };

/** The value of a cell for its column, or the text of the file with the message of a wrong cell. */
function cellValue(content: CellContent, type: ImportColumnType): CellValue {
  if (content === null) return { value: "" };

  if (type === "date") {
    if ("date" in content) return { value: isoDateOf(content.date) };
    if ("text" in content) {
      const isoDate = parseDateText(content.text);
      return isoDate ? { value: isoDate } : { value: content.text, error: message("date") };
    }
    return { value: String(content.number), error: message("date") };
  }

  if (type === "time") {
    if ("date" in content) return { value: formatMinutes(minutesOf(content.date)) };
    if ("text" in content) {
      const time = parseTimeText(content.text);
      return time ? { value: time } : { value: content.text, error: message("time") };
    }
    // A time cell whose format was lost is a share of a day: 0,5 is 12:00.
    const { number } = content;
    if (number >= 0 && number < 1) {
      return { value: formatMinutes(Math.min(Math.round(number * MINUTES_PER_DAY), 1439)) };
    }
    return { value: String(number), error: message("time") };
  }

  // Text and whole numbers: what the cell holds, as the section's own rules will read it.
  if ("date" in content) return { value: formatCalendarDate(content.date) };
  return { value: "number" in content ? String(content.number) : content.text };
}

export type ParseResult<TRow extends ImportRow> =
  { kind: "rows"; rows: ParsedRow<TRow>[] } | ImportFailure;

/**
 * The rows of the file with their numbers, with the fully empty ones left out. A file that cannot
 * be read as a spreadsheet, that misses a column or that holds no rows at all — or more than the
 * limit — is refused whole (docs/ТЗ.md, 7.13).
 */
export async function parseImportFile<TRow extends ImportRow>(
  file: ArrayBuffer,
  columns: ImportColumn<TRow>[],
): Promise<ParseResult<TRow>> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(file);
  } catch {
    return importFailure("import.errors.notXlsx");
  }

  const sheet = workbook.worksheets.at(0);
  if (!sheet) return importFailure("import.errors.notXlsx");

  const rows: ParsedRow<TRow>[] = [];
  // eachRow gives no way out of the walk, so what stops it is remembered instead.
  let columnsByKey: Map<keyof TRow & string, number> | undefined;
  let headerFailure: ImportFailure | undefined;
  let tooManyRows = false;

  sheet.eachRow({ includeEmpty: false }, (row) => {
    if (headerFailure || tooManyRows) return;

    if (!columnsByKey) {
      const found = headerColumns(row, columns);
      if ("error" in found) headerFailure = found;
      else columnsByKey = found.columnsByKey;
      return;
    }

    const parsed = parseRow(row, columns, columnsByKey);
    if (!parsed) return;
    if (rows.length === MAX_IMPORT_ROWS) tooManyRows = true;
    else rows.push(parsed);
  });

  if (headerFailure) return headerFailure;
  if (tooManyRows) {
    return importFailure("import.errors.tooManyRows", { limit: MAX_IMPORT_ROWS });
  }
  if (!columnsByKey || rows.length === 0) return importFailure("import.errors.noRows");

  return { kind: "rows", rows };
}

type HeaderResult<TRow extends ImportRow> =
  { columnsByKey: Map<keyof TRow & string, number> } | ImportFailure;

/** Finds every column of the import by its heading in the first row that holds anything. */
function headerColumns<TRow extends ImportRow>(
  row: ExcelJS.Row,
  columns: ImportColumn<TRow>[],
): HeaderResult<TRow> {
  const headers = new Map<string, number>();
  const duplicates = new Set<string>();

  row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const content = cellContent(cell.value);
    if (content === null || !("text" in content)) return;
    const header = normalizeHeader(content.text);
    if (headers.has(header)) duplicates.add(header);
    else headers.set(header, columnNumber);
  });

  const duplicate = columns.find((column) => duplicates.has(normalizeHeader(column.header)));
  if (duplicate) {
    return importFailure("import.errors.columnDuplicate", { column: duplicate.header });
  }

  const columnsByKey = new Map<keyof TRow & string, number>();
  const missing: string[] = [];
  for (const column of columns) {
    const columnNumber = headers.get(normalizeHeader(column.header));
    if (columnNumber === undefined) missing.push(column.header);
    else columnsByKey.set(column.key, columnNumber);
  }
  if (missing.length > 0) {
    return importFailure("import.errors.columnsMissing", { columns: missing.join(", ") });
  }

  return { columnsByKey };
}

/** One row of data, or nothing when every column of the import is empty in it. */
function parseRow<TRow extends ImportRow>(
  row: ExcelJS.Row,
  columns: ImportColumn<TRow>[],
  columnsByKey: Map<keyof TRow & string, number>,
): ParsedRow<TRow> | null {
  const values = {} as TRow;
  const cellErrors: ParsedRow<TRow>["cellErrors"] = {};
  let empty = true;

  for (const column of columns) {
    const columnNumber = columnsByKey.get(column.key);
    const content =
      columnNumber === undefined ? null : cellContent(row.getCell(columnNumber).value);
    if (content !== null) empty = false;

    const cell = cellValue(content, column.type);
    values[column.key] = cell.value as TRow[keyof TRow & string];
    if ("error" in cell) cellErrors[column.key] = cell.error;
    else if (column.required && cell.value === "") cellErrors[column.key] = message("required");
  }

  return empty ? null : { rowNumber: row.number, values, cellErrors };
}
