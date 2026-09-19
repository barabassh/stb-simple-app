import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { reportAccess } from "@/features/reports/columns";
import { reportsExport } from "@/features/reports/export";
import { parseReportsListParams } from "@/features/reports/list-params";
import { listReports, listReportsForExport } from "@/features/reports/queries";
import { usersExport } from "@/features/users/export";
import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { PRINT_ROW_LIMIT } from "@/lib/export";
import { exportRefusal, logExport, prepareExport } from "@/lib/export/service";
import { renderXlsx } from "@/lib/export/xlsx";
import { PermissionDeniedError } from "@/lib/permissions";

import { auditEntries, createUser, exportDocument, type TestUser } from "./helpers";
import { t } from "./translations";

// The timesheet (docs/ТЗ.md, 7.12) and the row limit of PDF and printing every registry shares
// (docs/ТЗ.md, 4.11).

async function createProject(name = "Renovatie kantoor", number = "2026-001") {
  const customer = await db.customer.create({ data: { type: "COMPANY", name: "Bakker B.V." } });
  return db.project.create({
    data: {
      number,
      name,
      customerId: customer.id,
      street: "de Geerenweg",
      houseNumber: 4,
      postcode: "3741 RS",
      city: "Baarn",
      startDate: new Date("2020-01-01T00:00:00Z"),
    },
    select: { id: true, number: true, name: true },
  });
}

type Project = Awaited<ReturnType<typeof createProject>>;

const minutes = (time: string) => {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
};

type NewReport = {
  date?: string;
  start?: string;
  end?: string;
  lunch?: number;
  mileageKm?: number;
  approvedBy?: TestUser;
  contractorId?: string | null;
};

function reportData(
  worker: TestUser,
  project: Project,
  report: NewReport = {},
): Prisma.WorkReportCreateManyInput {
  return {
    userId: worker.id,
    contractorId: report.contractorId ?? null,
    projectId: project.id,
    workDate: new Date(`${report.date ?? "2026-09-10"}T00:00:00Z`),
    workDescription: "Stucwerk plafond",
    startMinute: minutes(report.start ?? "08:00"),
    endMinute: minutes(report.end ?? "12:00"),
    lunchMinutes: report.lunch ?? 0,
    mileageKm: report.mileageKm ?? 0,
    ...(report.approvedBy
      ? {
          status: "APPROVED",
          approvedAt: new Date("2026-09-11T07:30:00Z"),
          approvedById: report.approvedBy.id,
        }
      : {}),
    createdById: worker.id,
    updatedById: worker.id,
  };
}

async function addReport(worker: TestUser, project: Project, report: NewReport = {}) {
  await db.workReport.create({ data: reportData(worker, project, report) });
}

/** One report a day from 01.01.2020, so that no two of them overlap. */
async function addReports(count: number, worker: TestUser, project: Project) {
  const firstDay = Date.UTC(2020, 0, 1);
  await db.workReport.createMany({
    data: Array.from({ length: count }, (_, index) =>
      reportData(worker, project, {
        date: new Date(firstDay + index * 86_400_000).toISOString().slice(0, 10),
      }),
    ),
  });
}

const tooManyRows = {
  error: "export.tooManyRows",
  errorValues: { limit: `2${String.fromCharCode(160)}000` },
};

describe("the timesheet", () => {
  it("has a row per report with the columns of the spec, and a totals row summed by the query", async () => {
    const manager = await createUser({ role: "MANAGER", fullName: "Мария Менеджер" });
    const { id: contractorId } = await db.contractor.create({ data: { name: "Bouw B.V." } });
    const builder = await createUser({
      role: "CONTRACTOR",
      fullName: "Jan de Vries",
      nickname: "Jan",
    });
    const employee = await createUser({ role: "EMPLOYEE", fullName: "Иван Иванов" });
    const project = await createProject();

    await addReport(builder, project, {
      date: "2026-09-10",
      start: "07:30",
      end: "16:10",
      lunch: 30,
      mileageKm: 42,
      approvedBy: manager,
      contractorId,
    });
    await addReport(builder, project, {
      date: "2026-09-11",
      end: "12:20",
      mileageKm: 3,
      contractorId,
    });
    await addReport(employee, project, { date: "2026-09-09", end: "09:00" });

    const content = await exportDocument(manager, reportsExport, {});

    expect(content.title).toBe(t("reports.export.title"));
    expect(content.columns.map((column) => column.key)).toEqual([
      "workDate",
      "worker",
      "nickname",
      "organization",
      "projectNumber",
      "projectName",
      "workDescription",
      "start",
      "end",
      "lunchMinutes",
      "hours",
      "mileageKm",
      "status",
      "approvedAt",
      "approvedBy",
    ]);
    // The registry's order: the newest day first.
    expect(content.rows).toEqual([
      expect.objectContaining({
        workDate: new Date("2026-09-11T00:00:00Z"),
        worker: "Jan de Vries",
        organization: "Bouw B.V.",
        status: t("reports.statuses.UNAPPROVED"),
        approvedAt: null,
        approvedBy: null,
      }),
      {
        workDate: new Date("2026-09-10T00:00:00Z"),
        worker: "Jan de Vries",
        nickname: "Jan",
        organization: "Bouw B.V.",
        projectNumber: "2026-001",
        projectName: "Renovatie kantoor",
        workDescription: "Stucwerk plafond",
        start: "07:30",
        end: "16:10",
        lunchMinutes: 30,
        hours: 490 / 60,
        mileageKm: 42,
        status: t("reports.statuses.APPROVED"),
        approvedAt: new Date("2026-09-11T07:30:00Z"),
        approvedBy: "Мария Менеджер",
      },
      expect.objectContaining({
        worker: "Иван Иванов",
        organization: t("reports.form.ourCompany"),
        hours: 1,
      }),
    ]);
    expect(content.totals).toEqual({ hours: (490 + 260 + 60) / 60, mileageKm: 45 });
  });

  it("follows the registry's filters, names them in the title and totals what the registry does", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const { id: contractorId } = await db.contractor.create({ data: { name: "Bouw B.V." } });
    const builder = await createUser({ role: "CONTRACTOR", nickname: "Jan" });
    const other = await createUser({ role: "CONTRACTOR" });
    const project = await createProject();

    await addReport(builder, project, {
      date: "2026-09-01",
      end: "12:45",
      mileageKm: 10,
      contractorId,
    });
    await addReport(builder, project, {
      date: "2026-09-30",
      end: "16:00",
      mileageKm: 20,
      contractorId,
    });
    await addReport(builder, project, { date: "2026-10-01", mileageKm: 5, contractorId });
    await addReport(builder, project, { date: "2026-08-31", contractorId });
    await addReport(other, project, { date: "2026-09-15" });
    await db.workReport.updateMany({
      where: { workDate: new Date("2026-09-30T00:00:00Z") },
      data: { deletedAt: new Date() },
    });
    await addReport(builder, project, {
      date: "2026-09-30",
      start: "17:00",
      end: "18:00",
      contractorId,
    });

    const filters = { from: "2026-09-01", to: "2026-09-30", org: contractorId };
    const content = await exportDocument(manager, reportsExport, filters);
    const registry = await listReports(
      manager,
      parseReportsListParams(filters, reportAccess(manager)),
    );

    expect(content.title).toBe(
      `${t("reports.export.title")} — 01.09.2026–30.09.2026, организация «Bouw B.V.»`,
    );
    expect(content.rows.map((row) => row.workDate)).toEqual([
      new Date("2026-09-30T00:00:00Z"),
      new Date("2026-09-01T00:00:00Z"),
    ]);
    expect(content.totals).toEqual({
      hours: registry.totals.minutes / 60,
      mileageKm: registry.totals.mileageKm,
    });
    expect(content.totals).toEqual({ hours: (285 + 60) / 60, mileageKm: 10 });

    const named = await exportDocument(manager, reportsExport, {
      project: project.id,
      worker: builder.id,
      status: "unapproved",
      km: "range",
      kmFrom: "5",
      q: "stuc",
    });
    expect(named.title).toBe(
      `${t("reports.export.title")} — проект 2026-001 «Renovatie kantoor», работник «Jan», ` +
        "не утверждённые, пробег от 5 км, поиск «stuc»",
    );
    expect(named.rows).toHaveLength(2);
  });

  it("writes the totals row into the spreadsheet as numbers", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const worker = await createUser({ role: "EMPLOYEE" });
    const project = await createProject();
    await addReport(worker, project, { date: "2026-09-10", end: "12:20", mileageKm: 1200 });
    await addReport(worker, project, { date: "2026-09-11", end: "15:00", lunch: 45, mileageKm: 7 });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      (await renderXlsx(
        await exportDocument(manager, reportsExport, {}),
      )) as unknown as ExcelJS.Buffer,
    );
    const [sheet] = workbook.worksheets;
    const header = (sheet.getRow(1).values as unknown[]).slice(1);
    const column = (key: string) => header.indexOf(t(`reports.export.columns.${key}` as never)) + 1;

    expect(sheet.rowCount).toBe(4);
    expect(sheet.getRow(2).getCell(column("hours"))).toMatchObject({
      value: 375 / 60,
      numFmt: "#,##0.00",
    });
    expect(sheet.getRow(2).getCell(column("lunchMinutes")).value).toBe(45);
    expect(sheet.getRow(2).getCell(column("start")).value).toBe("08:00");

    const totals = sheet.getRow(4);
    expect(totals.getCell(1).value).toBe(t("export.totals"));
    expect(totals.getCell(column("hours"))).toMatchObject({
      value: (260 + 375) / 60,
      numFmt: "#,##0.00",
    });
    expect(totals.getCell(column("mileageKm"))).toMatchObject({ value: 1207, numFmt: "#,##0" });
    expect(totals.getCell(column("lunchMinutes")).value).toBeNull();
    expect(totals.font).toMatchObject({ bold: true });
  });

  it.each<Role>(["EMPLOYEE", "CONTRACTOR"])("is refused to %s", async (role) => {
    const worker = await createUser({ role });
    await addReport(worker, await createProject());

    await expect(
      listReportsForExport(worker, parseReportsListParams({}, reportAccess(worker))),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    for (const format of ["xlsx", "pdf", "print"] as const) {
      await expect(prepareExport(worker, reportsExport, format, {})).rejects.toBeInstanceOf(
        PermissionDeniedError,
      );
    }
    expect(await auditEntries()).toEqual([]);
  });

  it("is logged with the row count and the title", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const worker = await createUser({ role: "EMPLOYEE" });
    const project = await createProject();
    await addReport(worker, project, { date: "2026-09-10" });
    await addReport(worker, project, { date: "2026-09-11" });

    const content = await exportDocument(manager, reportsExport, {}, "print");
    await logExport(manager, reportsExport, "print", content);

    expect(await auditEntries()).toEqual([
      expect.objectContaining({
        action: "EXPORT",
        actorId: manager.id,
        entity: "WorkReport",
        summary: t("audit.summaries.exported", {
          title: t("reports.export.title"),
          format: t("export.formats.print"),
          count: 2,
        }),
      }),
    ]);
  });
});

describe("the row limit of PDF and printing", () => {
  it("refuses PDF and printing of more than 2 000 reports but not the spreadsheet", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const worker = await createUser({ role: "EMPLOYEE" });
    const project = await createProject();
    await addReports(PRINT_ROW_LIMIT + 1, worker, project);

    expect(await exportRefusal(manager, reportsExport, "pdf", {})).toEqual(tooManyRows);
    expect(await exportRefusal(manager, reportsExport, "print", {})).toEqual(tooManyRows);
    expect(await exportRefusal(manager, reportsExport, "xlsx", {})).toBeNull();
    expect(await prepareExport(manager, reportsExport, "pdf", {})).toEqual({
      refusal: tooManyRows,
    });

    const spreadsheet = await exportDocument(manager, reportsExport, {}, "xlsx");
    expect(spreadsheet.rows).toHaveLength(PRINT_ROW_LIMIT + 1);

    // Narrowed by the filters to the limit itself, the rows are printed.
    const narrowed = { to: "2025-06-22" };
    expect(await exportRefusal(manager, reportsExport, "pdf", narrowed)).toBeNull();
    const printed = await exportDocument(manager, reportsExport, narrowed, "print");
    expect(printed.rows).toHaveLength(PRINT_ROW_LIMIT);
  });

  it("holds for another registry without a check of its own", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await db.user.createMany({
      data: Array.from({ length: PRINT_ROW_LIMIT }, (_, index) => ({
        login: `bulk${index}`,
        fullName: `Bulk User ${index}`,
        nickname: `bulk${index}`,
        passwordHash: "not-a-hash",
      })),
    });

    expect(await exportRefusal(admin, usersExport, "pdf", {})).toEqual(tooManyRows);
    expect(await exportRefusal(admin, usersExport, "print", {})).toEqual(tooManyRows);
    expect(await exportRefusal(admin, usersExport, "xlsx", {})).toBeNull();
    expect(await exportRefusal(admin, usersExport, "pdf", { q: "bulk" })).toBeNull();
  });
});
