import ExcelJS from "exceljs";

import { toDisplayWallClock } from "@/lib/format";

import {
  exportColumnWidths,
  totalsRow,
  type ExportColumnFormat,
  type ExportDocument,
  type ExportRow,
  type ExportValue,
} from ".";

// Format codes of the file, not display text: Excel shows the separators of the reader's locale.
const DATE_FORMAT = "dd.mm.yyyy";
const DATE_TIME_FORMAT = "dd.mm.yyyy hh:mm";
const INTEGER_FORMAT = "#,##0";
const DECIMAL_FORMAT = "#,##0.00";

const SHEET_NAME_FORBIDDEN = /[[\]:*?/\\]/g;
const SHEET_NAME_MAX_LENGTH = 31;

/** Dates are written as dates and numbers as numbers, so that the reader can sort and sum them. */
function toCell(
  value: ExportValue,
  format: ExportColumnFormat | undefined,
): { value: ExcelJS.CellValue; numFmt?: string } {
  if (value instanceof Date) {
    // A cell has no time zone: it gets the wall clock of Europe/Kyiv, as on screen.
    const wallClock = toDisplayWallClock(value);
    if (format !== "date") return { value: wallClock, numFmt: DATE_TIME_FORMAT };
    const day = Date.UTC(
      wallClock.getUTCFullYear(),
      wallClock.getUTCMonth(),
      wallClock.getUTCDate(),
    );
    return { value: new Date(day), numFmt: DATE_FORMAT };
  }
  if (typeof value === "number") {
    const decimal = format === "money" || format === "decimal" || !Number.isInteger(value);
    return { value, numFmt: decimal ? DECIMAL_FORMAT : INTEGER_FORMAT };
  }
  return { value };
}

export async function renderXlsx(content: ExportDocument): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = content.generatedAt;

  const sheet = workbook.addWorksheet(
    content.title.replace(SHEET_NAME_FORBIDDEN, " ").slice(0, SHEET_NAME_MAX_LENGTH),
    { views: [{ state: "frozen", ySplit: 1 }] },
  );
  const widths = exportColumnWidths(content);
  sheet.columns = content.columns.map((column, index) => ({
    header: column.header,
    key: column.key,
    width: widths[index],
  }));
  sheet.getRow(1).font = { bold: true };

  const addRow = (row: Partial<ExportRow>) => {
    const sheetRow = sheet.addRow([]);
    content.columns.forEach((column, index) => {
      const cell = sheetRow.getCell(index + 1);
      const { value, numFmt } = toCell(row[column.key] ?? null, column.format);
      cell.value = value;
      if (numFmt) cell.numFmt = numFmt;
      // Multi-line values, such as the changes of an audit entry, keep their lines.
      cell.alignment = { vertical: "top", wrapText: true };
    });
    return sheetRow;
  };

  content.rows.forEach(addRow);
  const totals = totalsRow(content);
  if (totals) addRow(totals).font = { bold: true };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
