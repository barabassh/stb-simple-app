import ExcelJS from "exceljs";
import type { Page } from "@playwright/test";

import { formatDate } from "@/lib/format";

import {
  expect,
  messages,
  plural,
  signIn,
  test,
  text,
  uniqueTag,
  waitForHydration,
} from "./fixtures";

// The report scenarios of stage 4 (docs/ТЗ.md, 7.7, 7.8, 7.11–7.13) across roles: what the rules
// refuse is checked by the tests with a database, so what is played out here is the screens.

const reports = messages.reports;
const importTexts = messages.import;

const WORK_DATE = "2026-09-02";
const WORK_DAY = "02.09.2026";

/** The headers of the reports template, in the order the instruction sheet lists them. */
const IMPORT_HEADERS = [
  reports.import.columns.workDate,
  reports.import.columns.nickname,
  reports.import.columns.project,
  reports.import.columns.workDescription,
  reports.import.columns.startTime,
  reports.import.columns.endTime,
  reports.import.columns.lunchMinutes,
  reports.import.columns.mileageKm,
];

type ImportRow = {
  nickname: string;
  project: string;
  description: string;
  start: string;
  end: string;
};

/** The file an import is given: built here, so that no sample file has to be kept in the repository. */
async function importFile(rows: ImportRow[]): Promise<{
  name: string;
  mimeType: string;
  buffer: Buffer;
}> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(reports.import.sheet);
  sheet.addRow(IMPORT_HEADERS);
  for (const row of rows) {
    sheet.addRow([
      formatDate(Date.now()),
      row.nickname,
      row.project,
      row.description,
      row.start,
      row.end,
      0,
      0,
    ]);
  }

  return {
    name: "reports.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
  };
}

/** The row of the registry a report's description lands in. */
function reportRow(page: Page, description: string) {
  return page.getByRole("row").filter({ hasText: description });
}

test("a manager approves the chosen reports, and a contractor edits one only once the approval is withdrawn", async ({
  page,
  browser,
  createUser,
  createContractor,
  createCustomer,
  createProject,
  createReport,
}) => {
  const manager = await createUser({ role: "MANAGER" });
  const organisation = await createContractor();
  const worker = await createUser({ role: "CONTRACTOR", contractorId: organisation.id });
  const customer = await createCustomer();
  const project = await createProject({ customerId: customer.id });
  const tag = uniqueTag();
  const [morning, afternoon] = await Promise.all([
    createReport({
      userId: worker.id,
      projectId: project.id,
      contractorId: organisation.id,
      workDate: WORK_DATE,
      workDescription: `E2E Ochtend ${tag}`,
    }),
    createReport({
      userId: worker.id,
      projectId: project.id,
      contractorId: organisation.id,
      workDate: WORK_DATE,
      startMinute: 13 * 60,
      endMinute: 17 * 60,
      workDescription: `E2E Middag ${tag}`,
    }),
  ]);

  await signIn(page, manager);
  await expect(page).toHaveURL("/");
  await page.goto(`/reports?q=${tag}`);

  const selectAll = page.getByRole("checkbox", { name: reports.list.selectPage });
  await waitForHydration(selectAll);
  await expect(reportRow(page, morning.workDescription)).toBeVisible();
  await selectAll.click();
  await page
    .getByRole("button", { name: text(reports.list.approveSelectedCount, { count: 2 }) })
    .click();

  await expect(page.getByText(text(reports.toasts.bulkApproved, { approved: 2 }))).toBeVisible();
  await expect(page.getByRole("button", { name: reports.statuses.APPROVED })).toHaveCount(2);

  // The worker no longer edits the approved report, neither from the card nor by its address.
  const workerContext = await browser.newContext();
  const workerPage = await workerContext.newPage();
  await signIn(workerPage, worker);
  await expect(workerPage).toHaveURL("/");

  await workerPage.goto(`/reports/${morning.id}`);
  await expect(workerPage.getByText(reports.statuses.APPROVED, { exact: true })).toBeVisible();
  await expect(workerPage.getByRole("link", { name: reports.actions.edit })).toHaveCount(0);
  await workerPage.goto(`/reports/${morning.id}/edit`);
  await expect(workerPage.getByText(reports.form.approvedMessage)).toBeVisible();

  // The manager withdraws the approval, naming the reason the worker is to read.
  const reason = `E2E Uren kloppen niet ${tag}`;
  await page.goto(`/reports/${morning.id}`);
  const unapprove = page.getByRole("button", { name: reports.actions.unapprove });
  await waitForHydration(unapprove);
  await unapprove.click();
  const dialog = page.getByRole("dialog", {
    name: text(reports.actions.unapproveTitle, { date: WORK_DAY, number: project.number }),
  });
  await dialog.getByLabel(reports.actions.reason).fill(reason);
  await dialog.getByRole("button", { name: reports.actions.unapprove }).click();
  // Exactly: the card of the report now carries the withdrawal with its date and reason too.
  await expect(page.getByText(reports.toasts.unapproved, { exact: true })).toBeVisible();

  await workerPage.goto(`/reports/${morning.id}`);
  await expect(workerPage.getByText(reason)).toBeVisible();
  await workerPage.getByRole("link", { name: reports.actions.edit }).click();
  const description = workerPage.getByLabel(reports.fields.workDescription, { exact: true });
  await waitForHydration(description);
  await description.fill(`E2E Ochtend ${tag} hersteld`);
  await workerPage.getByRole("button", { name: messages.referenceBooks.form.save }).click();
  await expect(workerPage.getByText(reports.toasts.updated)).toBeVisible();

  // The other report keeps its approval, so the withdrawal touched only the one it named.
  await page.goto(`/reports/${afternoon.id}`);
  await expect(page.getByText(reports.statuses.APPROVED, { exact: true })).toBeVisible();
  await workerContext.close();
});

test("a project with unapproved reports is not closed, and their number is named", async ({
  page,
  createUser,
  createCustomer,
  createProject,
  createReport,
}) => {
  const manager = await createUser({ role: "MANAGER" });
  const employee = await createUser({ role: "EMPLOYEE" });
  const customer = await createCustomer();
  const project = await createProject({ customerId: customer.id });
  await createReport({ userId: employee.id, projectId: project.id, workDate: WORK_DATE });
  await createReport({
    userId: employee.id,
    projectId: project.id,
    workDate: WORK_DATE,
    startMinute: 13 * 60,
    endMinute: 17 * 60,
  });

  await signIn(page, manager);
  await expect(page).toHaveURL("/");

  await page.goto(`/projects/${project.id}`);
  const close = page.getByRole("button", { name: messages.projects.actions.close, exact: true });
  await waitForHydration(close);
  await close.click();
  await page
    .getByRole("dialog", {
      name: text(messages.projects.dialogs.close.title, { number: project.number }),
    })
    .getByRole("button", { name: messages.projects.dialogs.close.confirm })
    .click();

  await expect(
    page.getByText(plural(messages.projects.errors.unapprovedReports, "other", 2)),
  ).toBeVisible();
  // The project stays in progress: the button still closes it rather than bringing it back.
  await expect(close).toBeVisible();
  await expect(
    page.getByRole("button", { name: messages.projects.actions.reopen, exact: true }),
  ).toHaveCount(0);
});

test("a manager imports reports from a file and a row with an unknown nickname stops the file", async ({
  page,
  createUser,
  createContractor,
  createCustomer,
  createProject,
}) => {
  const manager = await createUser({ role: "MANAGER" });
  const organisation = await createContractor();
  const worker = await createUser({ role: "CONTRACTOR", contractorId: organisation.id });
  const customer = await createCustomer();
  const project = await createProject({ customerId: customer.id });
  const tag = uniqueTag();
  const rows = [
    {
      nickname: worker.login,
      project: project.name,
      description: `E2E Import ${tag} A`,
      start: "08:00",
      end: "12:00",
    },
    {
      nickname: worker.login,
      project: project.name,
      description: `E2E Import ${tag} B`,
      start: "13:00",
      end: "17:00",
    },
  ];

  await signIn(page, manager);
  await expect(page).toHaveURL("/");
  await page.goto("/reports");
  await page.getByRole("link", { name: reports.import.button }).click();
  await expect(page).toHaveURL("/reports/import");

  const fileField = page.locator("#import-file");
  await waitForHydration(page.getByRole("link", { name: importTexts.template }));

  // A file whose row names nobody is refused row by row, and nothing of it is written.
  await fileField.setInputFiles(
    await importFile([{ ...rows[0], nickname: `${worker.login}.weg` }]),
  );
  await expect(page.getByText(reports.import.errors.workerNotFound)).toBeVisible();
  await expect(
    page.getByText(text(importTexts.summary, { rows: 1, ready: 0, failed: 1 })),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: plural(reports.import.confirm, "other", 0) }),
  ).toBeDisabled();

  await fileField.setInputFiles(await importFile(rows));
  await expect(
    page.getByText(text(importTexts.summary, { rows: 2, ready: 2, failed: 0 })),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: reports.import.approveAtOnce }).click();
  await page.getByRole("button", { name: plural(reports.import.confirm, "few", 2) }).click();

  await expect(page.getByText(text(reports.import.written, { count: 2 }))).toBeVisible();
  await expect(page).toHaveURL("/reports");

  await page.goto(`/reports?q=${tag}`);
  await expect(reportRow(page, rows[0].description)).toBeVisible();
  await expect(reportRow(page, rows[1].description)).toBeVisible();
  await expect(page.getByRole("button", { name: reports.statuses.APPROVED })).toHaveCount(2);
});

test("a manager downloads the timesheet with its total row and opens the participants of a project", async ({
  page,
  browser,
  createUser,
  createContractor,
  createCustomer,
  createProject,
  createReport,
}) => {
  const manager = await createUser({ role: "MANAGER" });
  const organisation = await createContractor();
  const contractor = await createUser({ role: "CONTRACTOR", contractorId: organisation.id });
  const employee = await createUser({ role: "EMPLOYEE" });
  const customer = await createCustomer();
  const project = await createProject({ customerId: customer.id });
  const tag = uniqueTag();
  await createReport({
    userId: contractor.id,
    projectId: project.id,
    contractorId: organisation.id,
    workDate: WORK_DATE,
    workDescription: `E2E Tabel ${tag} A`,
  });
  await createReport({
    userId: employee.id,
    projectId: project.id,
    workDate: WORK_DATE,
    startMinute: 13 * 60,
    endMinute: 17 * 60,
    workDescription: `E2E Tabel ${tag} B`,
  });

  await signIn(page, manager);
  await expect(page).toHaveURL("/");
  await page.goto(`/reports?q=${tag}`);

  const spreadsheet = page.getByRole("button", { name: messages.export.xlsx });
  await waitForHydration(spreadsheet);
  await spreadsheet.click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("dialog")
      .getByRole("button", { name: messages.export.columns.download })
      .click(),
  ]);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(await download.path());
  const cells = workbook.worksheets[0]
    .getRows(1, workbook.worksheets[0].rowCount)!
    .map((row) => (row.values as unknown[]).map((value) => value ?? ""));
  const totals = cells.find((row) => row.includes(messages.export.totals));
  expect(totals).toBeDefined();
  // Four hours each, as the timesheet counts them for the rows the filter left (docs/ТЗ.md, 7.12).
  expect(totals).toContain(8);
  expect(cells.some((row) => row.includes(`E2E Tabel ${tag} A`))).toBe(true);

  const participants = page.getByRole("tab", { name: messages.projects.card.tabs.participants });
  await page.goto(`/projects/${project.id}`);
  await waitForHydration(participants);
  await participants.click();
  await expect(
    page.getByRole("columnheader", { name: reports.participants.columns.approvedHours }),
  ).toBeVisible();
  await expect(page.getByText(organisation.name).first()).toBeVisible();

  // An employee is offered no such tab, and its address is refused (docs/ПРАВА-ДОСТУПА.md, 20).
  const employeeContext = await browser.newContext();
  const employeePage = await employeeContext.newPage();
  await signIn(employeePage, employee);
  await expect(employeePage).toHaveURL("/");

  await employeePage.goto(`/projects/${project.id}`);
  await expect(
    employeePage.getByRole("tab", { name: messages.projects.card.tabs.reports }),
  ).toBeVisible();
  await expect(
    employeePage.getByRole("tab", { name: messages.projects.card.tabs.participants }),
  ).toHaveCount(0);
  await employeePage.goto(`/projects/${project.id}?tab=participants`);
  await expect(employeePage).toHaveURL("/forbidden");
  await employeeContext.close();
});
