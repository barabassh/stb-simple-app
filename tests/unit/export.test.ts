import { inflateSync } from "node:zlib";

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  chooseColumns,
  exportColumnWidths,
  formatExportValue,
  totalsRow,
  type ExportDocument,
} from "@/lib/export";
import {
  exportFileHref,
  listHref,
  printHref,
  readExportColumns,
  withExportColumns,
} from "@/lib/export/links";
import { orderColumns } from "@/features/export/queries";
import { renderPdf } from "@/lib/export/pdf";
import { renderXlsx } from "@/lib/export/xlsx";

const NBSP = " ";

// 22:30 UTC is already the next day in Europe/Kyiv (UTC+3 in September).
const CREATED_AT = new Date("2026-09-13T22:30:00Z");
const LAST_LOGIN_AT = new Date("2026-09-14T08:20:00Z");

const content: ExportDocument = {
  title: "Реестр пользователей",
  columns: [
    { key: "login", header: "Логин" },
    { key: "fullName", header: "ФИО" },
    { key: "count", header: "Количество", format: "number" },
    { key: "amount", header: "Сумма", format: "money" },
    { key: "createdAt", header: "Дата создания", format: "date" },
    { key: "lastLoginAt", header: "Последний вход", format: "datetime" },
  ],
  rows: [
    {
      login: "ivanov",
      fullName: "Иванов Иван Иванович",
      count: 12345,
      amount: 1234.5,
      createdAt: CREATED_AT,
      lastLoginAt: LAST_LOGIN_AT,
    },
  ],
  fileName: "users_14.09.2026",
  generatedAt: new Date("2026-09-14T09:00:00Z"),
  labels: {
    generatedAt: "Дата выгрузки: 14.09.2026 12:00",
    author: "Автор: Администратор системы (admin)",
    empty: "Нет данных",
    totals: "Итого",
    page: (page, pages) => `Страница ${page} из ${pages}`,
  },
};

/** The characters the glyphs of a PDF map to: a glyph lost from its text is missing here. */
function embeddedCharacters(pdf: Buffer): Set<string> {
  const characters = new Set<string>();
  for (const match of pdf
    .toString("latin1")
    .matchAll(/\/Length (\d+)[^>]*\/FlateDecode[\s\S]*?stream\r?\n/g)) {
    const start = match.index + match[0].length;
    const data = inflateSync(pdf.subarray(start, start + Number(match[1]))).toString("latin1");
    if (!data.includes("begincmap")) continue;
    for (const [, hex] of data.matchAll(/<((?:[0-9a-f]{4})+)>/gi)) {
      characters.add(String.fromCharCode(...hex.match(/.{4}/g)!.map((part) => parseInt(part, 16))));
    }
  }
  return characters;
}

describe("formatExportValue", () => {
  it("formats values the way the screen shows them", () => {
    expect(formatExportValue(CREATED_AT, "date")).toBe("14.09.2026");
    expect(formatExportValue(LAST_LOGIN_AT, "datetime")).toBe("14.09.2026 11:20");
    expect(formatExportValue(1234.5, "money")).toBe(`1${NBSP}234,50`);
    expect(formatExportValue(12345, "number")).toBe(`12${NBSP}345`);
    expect(formatExportValue(2026, "text")).toBe("2026");
    expect(formatExportValue(null, "datetime")).toBe("");
  });
});

describe("exportColumnWidths", () => {
  it("fits the longest line of the header or the values and keeps a given width", () => {
    const widths = exportColumnWidths({
      title: "",
      columns: [
        { key: "login", header: "Логин" },
        { key: "changes", header: "Изменения" },
        { key: "summary", header: "Описание", width: 30 },
      ],
      rows: [
        { login: "ivanov.petr", changes: "ФИО: А → Б\nДолжность: не задано → Прораб", summary: "" },
      ],
    });

    expect(widths).toEqual([
      "ivanov.petr".length + 2,
      "Должность: не задано → Прораб".length + 2,
      30,
    ]);
  });
});

describe("export links", () => {
  const searchParams = {
    q: "iva",
    role: "ADMIN,MANAGER",
    sort: "login",
    page: "3",
    pageSize: "50",
  };

  it("pass the filters and the order of the list but not its page", () => {
    expect(exportFileHref("users", "xlsx", searchParams)).toBe(
      "/api/export/xlsx?report=users&q=iva&role=ADMIN%2CMANAGER&sort=login",
    );
    expect(printHref("users", searchParams)).toBe(
      "/print/users?q=iva&role=ADMIN%2CMANAGER&sort=login",
    );
    expect(printHref("audit", {})).toBe("/print/audit");
  });

  it("lead from the print view back to the list without the report name", () => {
    expect(listHref("/users", new URLSearchParams("report=users&status=all"))).toBe(
      "/users?status=all",
    );
  });
});

describe("renderXlsx", () => {
  it("writes headers in a frozen first row, dates as dates and numbers as numbers", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await renderXlsx(content)) as unknown as ExcelJS.Buffer);
    const [sheet] = workbook.worksheets;

    expect(sheet.name).toBe("Реестр пользователей");
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual(
      content.columns.map((column) => column.header),
    );

    const row = sheet.getRow(2);
    expect(row.getCell(1).value).toBe("ivanov");
    expect(row.getCell(3)).toMatchObject({ value: 12345, numFmt: "#,##0" });
    expect(row.getCell(4)).toMatchObject({ value: 1234.5, numFmt: "#,##0.00" });
    // A cell has no time zone, so it holds the wall clock of Europe/Kyiv.
    expect(row.getCell(5).value).toEqual(new Date(Date.UTC(2026, 8, 14)));
    expect(row.getCell(5).numFmt).toBe("dd.mm.yyyy");
    expect(row.getCell(6).value).toEqual(new Date(Date.UTC(2026, 8, 14, 11, 20)));
    expect(row.getCell(6).numFmt).toBe("dd.mm.yyyy hh:mm");
    expect(sheet.getColumn(2).width).toBe("Иванов Иван Иванович".length + 2);
  });
});

describe("renderPdf", () => {
  it("embeds a Cyrillic font and lays a long table out on several pages", async () => {
    const rows = Array.from({ length: 120 }, (_, index) => ({
      ...content.rows[0],
      login: `user${index}`,
    }));

    const pdf = await renderPdf({ ...content, rows });
    const source = pdf.toString("latin1");

    expect(source.startsWith("%PDF-")).toBe(true);
    // Regular and bold are embedded as two subsets, told apart by their tags.
    expect(new Set(source.match(/\/BaseFont \/[A-Z]{6}\+Inter\b/g)).size).toBe(2);
    expect(source.match(/\/Type \/Page\b/g)?.length).toBeGreaterThan(1);
  });

  it("keeps every letter of a document made after another one", async () => {
    // Cyrillic «С» and «Р» are drawn with the glyphs of Latin «C» and «P».
    await renderPdf({ ...content, title: "Статус", rows: [{ ...content.rows[0], login: "Роль" }] });

    const pdf = await renderPdf({
      ...content,
      title: "Журнал аудита",
      rows: [{ ...content.rows[0], login: "Chrome 140 · Windows", fullName: "IP-адрес" }],
    });

    expect([...embeddedCharacters(pdf)]).toEqual(expect.arrayContaining(["C", "I", "P"]));
  });
});

describe("the totals row", () => {
  const timesheet: ExportDocument = {
    ...content,
    title: "Timesheet",
    columns: [
      { key: "day", header: "Day", format: "date" },
      { key: "worker", header: "Worker" },
      { key: "hours", header: "Hours", format: "decimal" },
      { key: "km", header: "Km", format: "number" },
    ],
    rows: [
      { day: CREATED_AT, worker: "Jan", hours: 490 / 60, km: 42 },
      { day: LAST_LOGIN_AT, worker: "Piet", hours: 4, km: 1200 },
    ],
    totals: { hours: 730 / 60, km: 1242 },
    labels: {
      ...content.labels,
      generatedAt: "14.09.2026 12:00",
      author: "admin",
      page: (page, pages) => `${page} / ${pages}`,
    },
  };

  it("puts the label into the first column unless the report sums that column", () => {
    expect(totalsRow(timesheet)).toEqual({ day: "Итого", hours: 730 / 60, km: 1242 });
    expect(totalsRow({ ...timesheet, totals: undefined })).toBeNull();
    // Put first, a summed column keeps its sum, and the label moves to the next one without.
    expect(
      totalsRow({
        ...timesheet,
        columns: [timesheet.columns[2], ...timesheet.columns.slice(0, 2)],
      }),
    ).toEqual({ hours: 730 / 60, day: "Итого", km: 1242 });
    expect(formatExportValue(730 / 60, "decimal")).toBe("12,17");
    expect(formatExportValue(4, "decimal")).toBe("4,00");
  });

  it("is the last row of the spreadsheet, in bold, with numbers as numbers", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await renderXlsx(timesheet)) as unknown as ExcelJS.Buffer);
    const [sheet] = workbook.worksheets;

    expect(sheet.rowCount).toBe(4);
    expect(sheet.getRow(3).getCell(3)).toMatchObject({ value: 4, numFmt: "#,##0.00" });
    const totals = sheet.getRow(4);
    expect(totals.getCell(1).value).toBe("Итого");
    expect(totals.getCell(2).value).toBeNull();
    expect(totals.getCell(3)).toMatchObject({ value: 730 / 60, numFmt: "#,##0.00" });
    expect(totals.getCell(4)).toMatchObject({ value: 1242, numFmt: "#,##0" });
    expect(totals.font).toMatchObject({ bold: true });
  });

  it("is written into the PDF", async () => {
    // The label is the only text with these letters, so its glyphs show that it was written.
    const labelLetters = ["И", "т", "г"];
    const withTotals = embeddedCharacters(await renderPdf(timesheet));
    const without = embeddedCharacters(await renderPdf({ ...timesheet, totals: undefined }));

    expect([...withTotals]).toEqual(expect.arrayContaining(labelLetters));
    expect(labelLetters.filter((letter) => without.has(letter))).toEqual([]);
  });
});

describe("the chosen columns", () => {
  const columns = [{ key: "login" }, { key: "fullName" }, { key: "role" }];

  it("keep the order of the link and fall back to every column", () => {
    expect(chooseColumns(columns, ["role", "login", "role"])).toEqual([
      { key: "role" },
      { key: "login" },
    ]);
    expect(chooseColumns(columns, null)).toEqual(columns);
    expect(chooseColumns(columns, ["passwordHash"])).toEqual(columns);
  });

  it("travel in the link and are left out of the way back to the list", () => {
    const href = withExportColumns("/api/export/xlsx?report=users&q=iva", ["login", "role"]);
    expect(href).toBe("/api/export/xlsx?report=users&q=iva&columns=login%2Crole");
    expect(withExportColumns("/print/users", null)).toBe("/print/users");
    expect(readExportColumns(new URLSearchParams(href.split("?")[1]))).toEqual(["login", "role"]);
    expect(readExportColumns({})).toBeNull();
    expect(listHref("/users", { q: "iva", columns: "login" })).toBe("/users?q=iva");
    expect(printHref("users", { columns: "login" })).toBe("/print/users");
  });
});

describe("orderColumns", () => {
  it("keeps the saved order, drops what is gone and puts new columns last", () => {
    expect(
      orderColumns(["login", "fullName", "role", "status"], ["role", "gone", "login"]),
    ).toEqual(["role", "login", "fullName", "status"]);
    expect(orderColumns(["login", "role"], [])).toEqual(["login", "role"]);
  });
});
