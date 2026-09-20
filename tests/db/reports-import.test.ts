import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { checkImportFile, confirmImportFile } from "@/features/import/actions";
import { reportsImport } from "@/features/reports/import";
import { db } from "@/lib/db";
import {
  IMPORT_FILE_FIELD,
  IMPORT_OPTION_PREFIX,
  MAX_IMPORT_FILE_BYTES,
  type ImportResult,
} from "@/lib/import";
import { renderImportTemplate } from "@/lib/import/template";

import { actAs, auditEntries, createUser, type TestUser } from "./helpers";

// Importing work reports from Excel (docs/ТЗ.md, 7.13), through the actions the page calls: the
// files are built here, and nothing of a file with an error may reach the database.

const IMPORT_NAME = "reports";
const HEADERS = [
  "Дата",
  "Никнейм",
  "Проект",
  "Выполненные работы",
  "Начало",
  "Окончание",
  "Обед, мин",
  "Пробег, км",
];

let sequence = 0;

async function createProject(
  data: { name?: string; status?: "IN_PROGRESS" | "CLOSED"; startDate?: string } = {},
) {
  sequence += 1;
  const customer = await db.customer.create({ data: { type: "COMPANY", name: "Bakker B.V." } });
  return db.project.create({
    data: {
      number: `2026-${String(sequence).padStart(3, "0")}`,
      name: data.name ?? `Renovatie kantoor ${sequence}`,
      customerId: customer.id,
      street: "de Geerenweg",
      houseNumber: 4,
      postcode: "3741 RS",
      city: "Baarn",
      startDate: new Date(`${data.startDate ?? "2026-03-01"}T00:00:00Z`),
      ...(data.status === "CLOSED" ? { status: "CLOSED", closedAt: new Date() } : {}),
    },
    select: { id: true, number: true, name: true },
  });
}

type Project = Awaited<ReturnType<typeof createProject>>;

async function createContractorWorker(organisation: { isActive?: boolean } | null = {}) {
  sequence += 1;
  const user = await createUser({
    login: `worker${sequence}`,
    fullName: `Jansen Piet ${sequence}`,
    nickname: `Пит ${sequence}`,
    role: "CONTRACTOR",
  });
  if (!organisation) return user;

  const contractor = await db.contractor.create({
    data: { name: `Bouwbedrijf ${sequence}`, isActive: organisation.isActive ?? true },
  });
  await db.user.update({ where: { id: user.id }, data: { contractorId: contractor.id } });
  return user;
}

type FileRow = (string | number | Date | null)[];

const row = (
  worker: TestUser,
  project: Project,
  values: {
    date?: string;
    start?: string;
    end?: string;
    lunch?: string | number;
    km?: string | number;
    description?: string;
    nickname?: string;
    project?: string;
  } = {},
): FileRow => [
  values.date ?? "10.03.2026",
  values.nickname ?? worker.nickname,
  values.project ?? project.name,
  values.description ?? "Stucwerk plafond",
  values.start ?? "08:00",
  values.end ?? "12:00",
  values.lunch ?? 0,
  values.km ?? 42,
];

async function fileOf(rows: FileRow[], headers = HEADERS): Promise<File> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Отчёты");
  sheet.addRow(headers);
  for (const fileRow of rows) sheet.addRow(fileRow);
  const buffer = await workbook.xlsx.writeBuffer();

  return new File([buffer as ArrayBuffer], "reports.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function formDataOf(file: File, options: Record<string, boolean> = {}): FormData {
  const formData = new FormData();
  formData.set(IMPORT_FILE_FIELD, file);
  for (const [option, value] of Object.entries(options)) {
    formData.set(`${IMPORT_OPTION_PREFIX}${option}`, String(value));
  }
  return formData;
}

const check = (file: File) => checkImportFile(IMPORT_NAME, formDataOf(file));
const confirm = (file: File, options?: Record<string, boolean>) =>
  confirmImportFile(IMPORT_NAME, formDataOf(file, options));

/** The rows of a preview by their number in the file, with the keys of their messages. */
function errorsOf(result: ImportResult): Record<number, string[]> {
  if (result.kind !== "preview") throw new Error(`Not a preview: ${JSON.stringify(result)}`);
  return Object.fromEntries(
    result.rows.map((previewRow) => [
      previewRow.rowNumber,
      previewRow.errors.map((error) => error.key),
    ]),
  );
}

async function manager() {
  const user = await createUser({ role: "MANAGER", fullName: "Petrov Pjotr", nickname: "Пётр М." });
  await actAs(user);
  return user;
}

describe("importing work reports", () => {
  it("writes every row of a file without errors, unapproved", async () => {
    const boss = await manager();
    const [worker, other, project] = await Promise.all([
      createContractorWorker(),
      createUser({ role: "EMPLOYEE", login: "employee1", nickname: "Анна С." }),
      createProject(),
    ]);

    const file = await fileOf([
      row(worker, project, { start: "08:00", end: "12:00" }),
      row(worker, project, { start: "12:00", end: "16:30", lunch: 30, km: "" }),
      row(other, project, { date: "11.03.2026", km: 0 }),
    ]);
    const preview = await check(file);
    expect(preview).toMatchObject({ kind: "preview", ready: 3, stale: false });
    expect(await db.workReport.count()).toBe(0);

    expect(await confirm(file)).toEqual({ kind: "written", count: 3 });

    const reports = await db.workReport.findMany({
      orderBy: [{ workDate: "asc" }, { startMinute: "asc" }],
    });
    expect(reports).toHaveLength(3);
    expect(reports[0]).toMatchObject({
      userId: worker.id,
      projectId: project.id,
      status: "UNAPPROVED",
      startMinute: 480,
      endMinute: 720,
      lunchMinutes: 0,
      mileageKm: 42,
      createdById: boss.id,
      updatedById: boss.id,
      approvedAt: null,
    });
    // An empty cell of the mileage is a zero, and the worker's organisation is kept with the report.
    expect(reports[1]).toMatchObject({ lunchMinutes: 30, mileageKm: 0 });
    expect(reports[0].contractorId).not.toBeNull();
    expect(reports[2]).toMatchObject({ userId: other.id, contractorId: null });

    const entries = await auditEntries();
    const created = entries.filter((entry) => entry.action === "CREATE");
    const imports = entries.filter((entry) => entry.action === "IMPORT");
    expect(created).toHaveLength(3);
    expect(created[0].entityId).toBe(
      (await db.workReport.findFirstOrThrow({ where: { startMinute: 480 } })).id,
    );
    expect(created[0].summary).toContain("импорт из «reports.xlsx»");
    expect(imports).toHaveLength(1);
    expect(imports[0]).toMatchObject({
      entity: "WorkReport",
      entityId: null,
      summary: "Импорт отчётов из «reports.xlsx»: 3",
    });
  });

  it("approves the reports at once when the option is ticked", async () => {
    const boss = await manager();
    const [worker, project] = await Promise.all([createContractorWorker(), createProject()]);

    const file = await fileOf([row(worker, project)]);
    expect(await confirm(file, { approve: true })).toEqual({ kind: "written", count: 1 });

    const report = await db.workReport.findFirstOrThrow();
    expect(report).toMatchObject({ status: "APPROVED", approvedById: boss.id });
    expect(report.approvedAt).not.toBeNull();

    const entries = await auditEntries();
    expect(entries.at(-1)?.summary).toBe("Импорт отчётов из «reports.xlsx»: 1, сразу утверждены");
    expect(entries.find((entry) => entry.action === "CREATE")?.changes).toMatchObject(
      expect.arrayContaining([{ field: "status", before: null, after: "Утверждён" }]),
    );
  });

  it("writes nothing when a single row has an error", async () => {
    await manager();
    const [worker, project] = await Promise.all([createContractorWorker(), createProject()]);

    const file = await fileOf([
      row(worker, project),
      row(worker, project, { date: "11.03.2026", nickname: "Неизвестный" }),
    ]);

    expect(errorsOf(await check(file))).toEqual({
      2: [],
      3: ["reports.import.errors.workerNotFound"],
    });
    expect(await confirm(file)).toMatchObject({ kind: "preview", ready: 1, stale: true });
    expect(await db.workReport.count()).toBe(0);
  });

  it("names the rows a worker or a project cannot be found for", async () => {
    await manager();
    const project = await createProject();
    const [noOrganisation, archived, inactive, admin] = await Promise.all([
      createContractorWorker(null),
      createContractorWorker({ isActive: false }),
      createUser({ role: "EMPLOYEE", login: "left", nickname: "Ушёл", isActive: false }),
      createUser({ role: "ADMIN", login: "admin2", nickname: "Админ" }),
    ]);

    const file = await fileOf([
      row(noOrganisation, project),
      row(archived, project, { date: "11.03.2026" }),
      row(inactive, project, { date: "12.03.2026" }),
      row(admin, project, { date: "13.03.2026" }),
      row(admin, project, { date: "14.03.2026", project: "Нет такого проекта" }),
    ]);

    expect(errorsOf(await check(file))).toEqual({
      2: ["reports.errors.workerNoOrganization"],
      3: ["reports.errors.workerOrganizationArchived"],
      4: ["reports.errors.workerInvalid"],
      5: ["reports.errors.workerInvalid"],
      6: ["reports.errors.workerInvalid", "reports.import.errors.projectNotFound"],
    });
  });

  it("checks a row by the rules of the form", async () => {
    await manager();
    const [worker, project] = await Promise.all([
      createContractorWorker(),
      createProject({ startDate: "2026-03-05" }),
    ]);

    const file = await fileOf([
      row(worker, project, { date: "01.03.2026" }),
      row(worker, project, { date: "01.01.2030" }),
      row(worker, project, { start: "12:00", end: "08:00" }),
      row(worker, project, { lunch: 500 }),
      row(worker, project, { km: 3000 }),
      row(worker, project, { description: "ок" }),
      row(worker, project, { start: "25:00" }),
    ]);

    expect(errorsOf(await check(file))).toEqual({
      2: ["reports.errors.beforeProjectStart"],
      3: ["reports.validation.workDateInFuture"],
      4: ["reports.validation.endNotAfterStart"],
      5: ["reports.validation.lunchTooLong"],
      6: ["reports.validation.mileageInvalid"],
      7: ["reports.validation.workDescriptionLength"],
      8: ["import.cells.time"],
    });
    expect(await db.workReport.count()).toBe(0);
  });

  it("finds the worker and the project without regard to case", async () => {
    await manager();
    const [worker, project] = await Promise.all([
      createContractorWorker(),
      createProject({ name: "Renovatie Kantoor" }),
    ]);

    const file = await fileOf([
      row(worker, project, {
        nickname: worker.nickname.toUpperCase(),
        project: "renovatie kantoor",
      }),
    ]);

    expect(await confirm(file)).toEqual({ kind: "written", count: 1 });
  });

  it("refuses rows that overlap each other and reports already written", async () => {
    await manager();
    const [worker, project] = await Promise.all([createContractorWorker(), createProject()]);

    const first = await fileOf([row(worker, project, { start: "08:00", end: "12:00" })]);
    expect(await confirm(first)).toEqual({ kind: "written", count: 1 });

    // The same file again: every row of it overlaps the reports it wrote the first time.
    expect(errorsOf(await check(first))).toEqual({ 2: ["reports.errors.overlap"] });

    const withinFile = await fileOf([
      row(worker, project, { date: "11.03.2026", start: "08:00", end: "12:00" }),
      row(worker, project, { date: "11.03.2026", start: "11:00", end: "15:00" }),
      // Meeting at 15:00 is not overlapping.
      row(worker, project, { date: "11.03.2026", start: "15:00", end: "16:00" }),
    ]);
    expect(errorsOf(await check(withinFile))).toEqual({
      2: ["reports.import.errors.overlapRow"],
      3: ["reports.import.errors.overlapRow"],
      4: [],
    });
    expect(await db.workReport.count()).toBe(1);
  });

  it("points the row at the report in the way", async () => {
    await manager();
    const [worker, project] = await Promise.all([createContractorWorker(), createProject()]);
    const file = await fileOf([row(worker, project)]);
    await confirm(file);
    const written = await db.workReport.findFirstOrThrow();

    const preview = await check(file);
    if (preview.kind !== "preview") throw new Error("Not a preview");
    expect(preview.rows[0].errors[0]).toMatchObject({
      key: "reports.errors.overlap",
      column: "startTime",
      href: `/reports/${written.id}`,
      values: { start: "08:00", end: "12:00", number: project.number },
    });
  });

  it("writes nothing when the project is closed between the preview and the confirmation", async () => {
    await manager();
    const [worker, project] = await Promise.all([createContractorWorker(), createProject()]);

    const file = await fileOf([row(worker, project)]);
    expect(await check(file)).toMatchObject({ ready: 1 });

    await db.project.update({
      where: { id: project.id },
      data: { status: "CLOSED", closedAt: new Date() },
    });

    const result = await confirm(file);
    expect(result).toMatchObject({ kind: "preview", ready: 0, stale: true });
    expect(errorsOf(result)).toEqual({ 2: ["reports.import.errors.projectNotFound"] });
    expect(await db.workReport.count()).toBe(0);
  });

  it("refuses a file of a closed project from the start", async () => {
    await manager();
    const [worker, project] = await Promise.all([
      createContractorWorker(),
      createProject({ status: "CLOSED" }),
    ]);

    expect(errorsOf(await check(await fileOf([row(worker, project)])))).toEqual({
      2: ["reports.import.errors.projectNotFound"],
    });
  });

  it("refuses the import to an employee and to a contractor", async () => {
    const [worker, project] = await Promise.all([createContractorWorker(), createProject()]);
    const file = await fileOf([row(worker, project)]);

    for (const user of [
      await createUser({ role: "EMPLOYEE", login: "employee9", nickname: "Сотрудник" }),
      worker,
    ]) {
      await actAs(user);
      expect(await check(file)).toEqual({ kind: "failure", error: "errors.forbiddenAction" });
      expect(await confirm(file)).toEqual({ kind: "failure", error: "errors.forbiddenAction" });
    }
    expect(await db.workReport.count()).toBe(0);
  });

  it("refuses an unknown import, a missing file and a file that is not .xlsx", async () => {
    await manager();

    expect(await checkImportFile("expenses", formDataOf(await fileOf([])))).toEqual({
      kind: "failure",
      error: "errors.invalidRequest",
    });
    expect(await checkImportFile(IMPORT_NAME, new FormData())).toEqual({
      kind: "failure",
      error: "import.errors.noFile",
    });

    const csv = new File(["Дата;Никнейм"], "reports.csv", { type: "text/csv" });
    expect(await check(csv)).toEqual({ kind: "failure", error: "import.errors.notXlsx" });

    const big = new File([new Uint8Array(MAX_IMPORT_FILE_BYTES + 1)], "reports.xlsx");
    expect(await check(big)).toEqual({
      kind: "failure",
      error: "import.errors.tooLarge",
      errorValues: { size: 5 },
    });
  });

  it("imports the template filled in as its instructions say", async () => {
    await manager();
    const [worker, project] = await Promise.all([createContractorWorker(), createProject()]);

    const template = await renderImportTemplate(await reportsImport.texts());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(template as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    const example = workbook.worksheets[1].getRow(workbook.worksheets[1].rowCount);
    // The example row of the "Инструкция" sheet, for a worker and a project that exist.
    sheet.addRow([
      "10.03.2026",
      worker.nickname,
      project.name,
      String(example.getCell(4).value),
      String(example.getCell(5).value),
      String(example.getCell(6).value),
      String(example.getCell(7).value),
      String(example.getCell(8).value),
    ]);
    const filled = new File([(await workbook.xlsx.writeBuffer()) as ArrayBuffer], "reports.xlsx");

    expect(errorsOf(await check(filled))).toEqual({ 2: [] });
    expect(await confirm(filled)).toEqual({ kind: "written", count: 1 });
    expect(await db.workReport.findFirstOrThrow()).toMatchObject({
      startMinute: 480,
      endMinute: 990,
      lunchMinutes: 30,
      mileageKm: 42,
    });
  });
});
