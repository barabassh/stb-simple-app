import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { MAX_IMPORT_ROWS, type ImportColumn } from "@/lib/import";
import { parseImportFile } from "@/lib/import/parse";

// Reading a file of an import (docs/ТЗ.md, 7.13; docs/АРХИТЕКТУРА.md, 3.11). The files are built
// here by the same library the application writes them with.

type Row = {
  workDate: string;
  nickname: string;
  workDescription: string;
  startTime: string;
  lunchMinutes: string;
};

const columns: ImportColumn<Row>[] = [
  { key: "workDate", header: "Дата", type: "date", required: true },
  { key: "nickname", header: "Никнейм", type: "text", required: true },
  { key: "workDescription", header: "Выполненные работы", type: "text" },
  { key: "startTime", header: "Начало", type: "time", required: true },
  { key: "lunchMinutes", header: "Обед, мин", type: "integer" },
];

type Cell = ExcelJS.CellValue;

async function fileOf(
  rows: Cell[][],
  headers: string[] = columns.map((column) => column.header),
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Отчёты");
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

async function parse(rows: Cell[][], headers?: string[]) {
  return parseImportFile(await fileOf(rows, headers), columns);
}

const date = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`);
/** A time cell as Excel keeps it: a share of a day counted from the epoch of the workbook. */
const time = (hours: number, minutes: number, seconds = 0) =>
  new Date(Date.UTC(1899, 11, 30, hours, minutes, seconds));

describe("parseImportFile", () => {
  it("reads date, time, text and whole-number cells", async () => {
    const result = await parse([[date("2026-09-18"), "Иван И.", "Стяжка", time(8, 30), 30]]);

    expect(result).toEqual({
      kind: "rows",
      rows: [
        {
          rowNumber: 2,
          values: {
            workDate: "2026-09-18",
            nickname: "Иван И.",
            workDescription: "Стяжка",
            startTime: "08:30",
            lunchMinutes: "30",
          },
          cellErrors: {},
        },
      ],
    });
  });

  it("reads dates and times written as text", async () => {
    const result = await parse([["18.09.2026", " Иван И. ", "Стяжка", "8:05", " 45 "]]);

    expect(result).toMatchObject({
      rows: [
        {
          values: {
            workDate: "2026-09-18",
            nickname: "Иван И.",
            startTime: "08:05",
            lunchMinutes: "45",
          },
          cellErrors: {},
        },
      ],
    });
  });

  it("rounds a time cell to the minute and keeps a lost time format as a share of a day", async () => {
    const result = await parse([
      [date("2026-09-18"), "Иван И.", "", time(8, 29, 59), 0],
      [date("2026-09-18"), "Иван И.", "", 0.5, 0],
    ]);

    expect(result).toMatchObject({
      rows: [{ values: { startTime: "08:30" } }, { values: { startTime: "12:00" } }],
    });
  });

  it("keeps the text of a cell that is not of its column's type and names the error", async () => {
    const result = await parse([["32.09.2026", "Иван И.", "Стяжка", "25:00", "полчаса"]]);

    expect(result).toMatchObject({
      rows: [
        {
          values: { workDate: "32.09.2026", startTime: "25:00", lunchMinutes: "полчаса" },
          cellErrors: { workDate: "import.cells.date", startTime: "import.cells.time" },
        },
      ],
    });
  });

  it("names an empty cell of a required column", async () => {
    const result = await parse([[null, "", "Стяжка", null, null]]);

    expect(result).toMatchObject({
      rows: [
        {
          values: { workDate: "", nickname: "", startTime: "", lunchMinutes: "" },
          cellErrors: {
            workDate: "import.cells.required",
            nickname: "import.cells.required",
            startTime: "import.cells.required",
          },
        },
      ],
    });
  });

  it("skips fully empty rows and keeps the numbers of the rest", async () => {
    const result = await parse([
      [date("2026-09-18"), "Иван И.", "Стяжка", time(8, 0), 0],
      [null, null, null, null, null],
      ["", "  ", "", "", ""],
      [date("2026-09-19"), "Пётр П.", "Плитка", time(9, 0), 0],
    ]);

    expect(result).toMatchObject({
      rows: [{ rowNumber: 2 }, { rowNumber: 5 }],
    });
  });

  it("finds the columns in any order and by a heading of any case, and reads no others", async () => {
    const headers = ["  никнейм ", "Лишняя", "ОБЕД, МИН", "начало", "дата", "Выполненные работы"];
    const result = await parse(
      [["Иван И.", "не читается", 30, "08:00", "18.09.2026", "Стяжка"]],
      headers,
    );

    expect(result).toMatchObject({
      rows: [
        {
          values: {
            nickname: "Иван И.",
            lunchMinutes: "30",
            startTime: "08:00",
            workDate: "2026-09-18",
            workDescription: "Стяжка",
          },
        },
      ],
    });
  });

  it("refuses a file without a column the import needs, naming the columns", async () => {
    const result = await parse([["Иван И.", "08:00"]], ["Никнейм", "Начало"]);

    expect(result).toEqual({
      kind: "failure",
      error: "import.errors.columnsMissing",
      errorValues: { columns: "Дата, Выполненные работы, Обед, мин" },
    });
  });

  it("refuses a file with the same column twice", async () => {
    const result = await parse(
      [["18.09.2026", "Иван И.", "Стяжка", "08:00", 0, "Иван И."]],
      [...columns.map((column) => column.header), "никнейм"],
    );

    expect(result).toEqual({
      kind: "failure",
      error: "import.errors.columnDuplicate",
      errorValues: { column: "Никнейм" },
    });
  });

  it("refuses a file without rows of data", async () => {
    expect(await parse([])).toEqual({ kind: "failure", error: "import.errors.noRows" });
  });

  it("refuses more rows than the limit", async () => {
    const row: Cell[] = [date("2026-09-18"), "Иван И.", "Стяжка", time(8, 0), 0];
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => row);

    expect(await parse(rows)).toEqual({
      kind: "failure",
      error: "import.errors.tooManyRows",
      errorValues: { limit: MAX_IMPORT_ROWS },
    });
  });

  it("imports exactly the limit of rows", async () => {
    const row: Cell[] = [date("2026-09-18"), "Иван И.", "Стяжка", time(8, 0), 0];
    const result = await parse(Array.from({ length: MAX_IMPORT_ROWS }, () => row));

    expect(result).toMatchObject({ kind: "rows" });
    expect(result.kind === "rows" && result.rows).toHaveLength(MAX_IMPORT_ROWS);
  });

  it("refuses a file that is not a spreadsheet", async () => {
    const file = new TextEncoder().encode("Дата;Никнейм\n18.09.2026;Иван И.\n");

    expect(await parseImportFile(file.buffer as ArrayBuffer, columns)).toEqual({
      kind: "failure",
      error: "import.errors.notXlsx",
    });
  });
});
