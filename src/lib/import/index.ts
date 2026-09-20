import type { Prisma } from "@/generated/prisma/client";
import type { AuditEntity } from "@/lib/audit";
import type { ClientInfo } from "@/lib/request-info";
import type { Permission } from "@/lib/permissions";
import type { SessionUser } from "@/lib/auth/session";

// The import of a section: the file is parsed, every row is checked, the preview shows the result,
// and a confirmation writes all the rows or none (docs/АРХИТЕКТУРА.md, 3.11). Nothing is stored
// between the preview and the confirmation: the file stays in the browser and is sent again.

/** A file larger than this is refused before it is read (docs/ТЗ.md, 7.13). */
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

/** Rows with data, without the row of headers. */
export const MAX_IMPORT_ROWS = 2000;

export const IMPORT_FILE_EXTENSION = ".xlsx";

/** The field of the form data that carries the file, and the prefix of the option fields. */
export const IMPORT_FILE_FIELD = "file";
export const IMPORT_OPTION_PREFIX = "option:";

/**
 * How a cell is read: text as it is, a whole number as digits, a date as `yyyy-MM-dd` and a time
 * as `HH:mm`, from a date, time or text cell alike. So the checks of a row work on the same values
 * a form sends, and the rules of the form are not written a second time.
 */
export type ImportColumnType = "text" | "integer" | "date" | "time";

/** Every value of a parsed row is text: the rules of the section parse it further. */
export type ImportRow = Record<string, string>;

export type ImportColumn<TRow extends ImportRow = ImportRow> = {
  key: keyof TRow & string;
  /** The heading in the file, already translated; the file's columns are found by it. */
  header: string;
  type: ImportColumnType;
  /** An empty cell of a required column is an error of the row. */
  required?: boolean;
  /** Width of the column of the template, in characters. */
  width?: number;
};

export type ParsedRow<TRow extends ImportRow = ImportRow> = {
  /** The number of the row in the file, as the spreadsheet shows it in the margin. */
  rowNumber: number;
  values: TRow;
  /**
   * Cells that are not of their column's type, with the message; such a value stays as the text
   * of the file, so that the preview shows what is written there.
   */
  cellErrors: Partial<Record<keyof TRow & string, string>>;
};

/** A message about a row: a translation key, its values and what it points at. */
export type ImportMessage = {
  key: string;
  values?: Record<string, string | number>;
  /** Key of the column the message belongs to; its heading goes before the message. */
  column?: string;
  /** A record the message points at, e.g. the report in the way of an overlapping row. */
  href?: string;
};

/** What the preview shows of a row, in the order of the columns of the preview. */
export type ImportRowCells = Record<string, string>;

export type RowResult<TReady> =
  | { rowNumber: number; cells: ImportRowCells; ready: TReady }
  | { rowNumber: number; cells: ImportRowCells; errors: ImportMessage[] };

export type ImportPreviewColumn = {
  key: string;
  header: string;
  /** Long text that wraps inside its cell; the other columns stay on one line. */
  wrap?: boolean;
};

/** Everything of an import that has to be translated, read once per request. */
export type ImportTexts<TRow extends ImportRow = ImportRow> = {
  /** Names the data sheet of the template and titles the preview. */
  title: string;
  columns: ImportColumn<TRow>[];
  /** The lines of the "Инструкция" sheet of the template. */
  instructions: string[];
  /** The example row of that sheet; filled in by the instructions, it imports without errors. */
  example: TRow;
  columnsOfPreview: ImportPreviewColumn[];
};

/** The options of the confirmation, by their names in the definition: "Сразу утвердить". */
export type ImportOptions = Record<string, boolean>;

export type ImportWriteContext = {
  actor: SessionUser;
  options: ImportOptions;
  fileName: string;
  request: ClientInfo;
};

export type ImportDefinition<TRow extends ImportRow = ImportRow, TReady = unknown> = {
  /** Names the import in links, in the file name of the template and in the audit log. */
  name: string;
  permission: Permission;
  entity: AuditEntity;
  options: readonly string[];
  texts: () => Promise<ImportTexts<TRow>>;
  /**
   * Checks every row of the file at once: rows that overlap each other, or a record already
   * stored, are only seen together.
   */
  check: (rows: ParsedRow<TRow>[], actor: SessionUser) => Promise<RowResult<TReady>[]>;
  /**
   * Writes the ready rows inside the given transaction, together with the audit entries of the
   * records themselves. Data changed since the check — a project closed, a row now overlapping —
   * makes it throw `ImportStale`, and nothing is written.
   */
  write: (
    tx: Prisma.TransactionClient,
    ready: TReady[],
    context: ImportWriteContext,
  ) => Promise<void>;
  /** The summary of the one IMPORT entry of the log (docs/СХЕМА-БД.md, 10.5). */
  summary: (values: { fileName: string; count: number; options: ImportOptions }) => Promise<string>;
  /** The pages the written records show on. */
  revalidate?: () => void;
};

/**
 * Checks the rows of a section against its columns and hands the import on to the code that serves
 * any import; the wider type stays safe, as every value of a row is a string.
 */
export function defineImport<TRow extends ImportRow, TReady>(
  definition: ImportDefinition<TRow, TReady>,
): ImportDefinition {
  return definition as unknown as ImportDefinition;
}

/**
 * The data changed between the check and the write, so the whole import is rolled back and checked
 * again (docs/ТЗ.md, 7.13). Thrown inside the transaction: returning would commit it.
 */
export class ImportStale extends Error {
  constructor() {
    super("The data changed after the import was checked");
    this.name = "ImportStale";
  }
}

export type ImportPreviewRow = {
  rowNumber: number;
  cells: ImportRowCells;
  errors: ImportMessage[];
};

/** Why the file as a whole is not imported: a translation key and its values. */
export type ImportFailure = {
  kind: "failure";
  error: string;
  errorValues?: Record<string, string | number>;
};

export type ImportResult =
  | {
      kind: "preview";
      columns: ImportPreviewColumn[];
      /** Heading of every column of the file, by its key: a message of a row goes under it. */
      headers: Record<string, string>;
      rows: ImportPreviewRow[];
      /** How many rows would be written. */
      ready: number;
      /** The confirmation found the data changed since the preview it was sent with. */
      stale: boolean;
    }
  | ImportFailure
  | { kind: "written"; count: number };

export const importFailure = (
  error: string,
  errorValues?: Record<string, string | number>,
): ImportFailure => ({ kind: "failure", error, errorValues });
