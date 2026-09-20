import ExcelJS from "exceljs";
import { getTranslations } from "next-intl/server";

import type { ImportColumn, ImportRow, ImportTexts } from ".";

// The template of an import is built from the same description of columns the file is read by
// (docs/АРХИТЕКТУРА.md, 3.11): a sheet of data with the row of headings and a sheet "Инструкция"
// with the rules and an example row.

const DATE_FORMAT = "dd.mm.yyyy";
const TIME_FORMAT = "hh:mm";
const DEFAULT_WIDTH = 16;

function columnFormat(type: ImportColumn["type"]): string | undefined {
  if (type === "date") return DATE_FORMAT;
  return type === "time" ? TIME_FORMAT : undefined;
}

/** The file of `/api/import/template?name=…`, ready to be filled in and imported back. */
export async function renderImportTemplate<TRow extends ImportRow>(
  texts: ImportTexts<TRow>,
): Promise<Buffer> {
  const t = await getTranslations("import.templateSheet");
  const workbook = new ExcelJS.Workbook();

  const sheet = workbook.addWorksheet(texts.title, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = texts.columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width ?? DEFAULT_WIDTH,
    style: { numFmt: columnFormat(column.type) },
  }));
  sheet.getRow(1).font = { bold: true };
  // The headings carry the format of their column, which would show them as dates.
  sheet.getRow(1).numFmt = "General";

  const guide = workbook.addWorksheet(t("sheet"));
  texts.columns.forEach((column, index) => {
    guide.getColumn(index + 1).width = column.width ?? DEFAULT_WIDTH;
  });

  // A line of the rules is longer than any column, so it spans the width of the example table.
  const line = (text: string, bold = false) => {
    const row = guide.addRow([text]);
    row.font = { bold };
    row.alignment = { wrapText: true, vertical: "top" };
    if (texts.columns.length > 1) {
      guide.mergeCells(row.number, 1, row.number, texts.columns.length);
    }
    return row;
  };

  line(t("rules"), true);
  for (const rule of texts.instructions) line(rule);

  guide.addRow([]);
  line(t("example"), true);
  guide.addRow(texts.columns.map((column) => column.header)).font = { bold: true };
  guide.addRow(texts.columns.map((column) => texts.example[column.key]));

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
