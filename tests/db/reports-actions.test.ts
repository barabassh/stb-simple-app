import { describe, expect, it } from "vitest";

import {
  createOwnReport,
  createReport,
  deleteReport,
  updateReport,
} from "@/features/reports/actions";
import { reportFormValues, type ReportFormInput } from "@/features/reports/form-values";
import { getReportForEdit } from "@/features/reports/queries";
import { db } from "@/lib/db";
import { displayTodayIso } from "@/lib/format";

import { actAs, auditEntries, createUser, type TestUser } from "./helpers";
import { t } from "./translations";

// Filing, editing and deleting work reports by calling the actions directly, as a request that
// bypasses the form would (docs/ТЗ.md, 7.2–7.8; docs/ПРАВА-ДОСТУПА.md, rules 16–19).

const forbidden = { ok: false, error: "errors.forbiddenAction" };
const closed = { ok: false, error: "projects.errors.closed" };
const notFound = { ok: false, error: "reports.errors.notFound" };
const approved = { ok: false, error: "reports.errors.approved" };
const workerError = (key: string) => ({
  ok: false,
  fieldErrors: { userId: [`reports.errors.${key}`] },
});

let sequence = 0;

const closing = { status: "CLOSED", closedAt: new Date() } as const;
const reopening = { status: "IN_PROGRESS", closedAt: null } as const;

async function createProject(data: { status?: "IN_PROGRESS" | "CLOSED"; startDate?: string } = {}) {
  sequence += 1;
  const customer = await db.customer.create({ data: { type: "COMPANY", name: "Bakker B.V." } });
  return db.project.create({
    data: {
      number: `2026-${String(sequence).padStart(3, "0")}`,
      name: `Renovatie ${sequence}`,
      customerId: customer.id,
      street: "de Geerenweg",
      houseNumber: 4,
      postcode: "3741 RS",
      city: "Baarn",
      startDate: new Date(`${data.startDate ?? "2026-03-01"}T00:00:00Z`),
      ...(data.status === "CLOSED" ? closing : {}),
    },
    select: { id: true, number: true, name: true },
  });
}

type Project = Awaited<ReturnType<typeof createProject>>;

function reportInput(project: Project, changes: Partial<ReportFormInput> = {}): ReportFormInput {
  return {
    projectId: project.id,
    workDate: "2026-03-10",
    workDescription: "Stucwerk plafond",
    startTime: "08:00",
    endTime: "12:00",
    lunchMinutes: "0",
    mileageKm: "42",
    ...changes,
  };
}

async function contractorAccount(organisation: { isActive: boolean } | null, isActive = true) {
  const user = await createUser({ role: "CONTRACTOR", fullName: "Jansen Piet", isActive });
  if (organisation) {
    const { id } = await db.contractor.create({
      data: { name: "Bouwbedrijf Jansen", ...organisation },
    });
    await db.user.update({ where: { id: user.id }, data: { contractorId: id } });
  }
  return user;
}

async function filedBy(actor: TestUser, project: Project, changes: Partial<ReportFormInput> = {}) {
  await actAs(actor);
  const result = await createOwnReport(reportInput(project, changes));
  if (!result.ok) throw new Error(`The report was not filed: ${JSON.stringify(result)}`);
  return result.id;
}

function reportRow(id: string) {
  return db.workReport.findUniqueOrThrow({ where: { id } });
}

async function approve(id: string, by: TestUser) {
  await db.workReport.update({
    where: { id },
    data: { status: "APPROVED", approvedAt: new Date(), approvedById: by.id },
  });
}

describe("filing a report of one's own", () => {
  it("writes the report for the sender, with the organisation of the account", async () => {
    const project = await createProject();
    const worker = await contractorAccount({ isActive: true });

    const id = await filedBy(worker, project);

    const report = await db.workReport.findUniqueOrThrow({
      where: { id },
      include: { contractor: true },
    });
    expect(report).toMatchObject({
      userId: worker.id,
      status: "UNAPPROVED",
      startMinute: 480,
      endMinute: 720,
      lunchMinutes: 0,
      mileageKm: 42,
      createdById: worker.id,
    });
    expect(report.contractor?.name).toBe("Bouwbedrijf Jansen");
  });

  it("keeps an employee's report without an organisation", async () => {
    const project = await createProject();
    const id = await filedBy(await createUser({ role: "EMPLOYEE" }), project);
    expect((await reportRow(id)).contractorId).toBeNull();
  });

  it("refuses another worker named by a contractor, like a change of role", async () => {
    const project = await createProject();
    const colleague = await contractorAccount({ isActive: true });
    await actAs(await contractorAccount({ isActive: true }));

    await expect(
      createOwnReport({ ...reportInput(project), userId: colleague.id }),
    ).resolves.toEqual(forbidden);
    expect(await db.workReport.count()).toBe(0);
  });

  it("refuses a contractor account without an organisation or of an archived one", async () => {
    const project = await createProject();

    await actAs(await contractorAccount(null));
    await expect(createOwnReport(reportInput(project))).resolves.toEqual({
      ok: false,
      error: "reports.errors.noOrganization",
    });

    await actAs(await contractorAccount({ isActive: false }));
    await expect(createOwnReport(reportInput(project))).resolves.toEqual({
      ok: false,
      error: "reports.errors.organizationArchived",
    });
    expect(await db.workReport.count()).toBe(0);
  });

  it("is not how an administrator or a manager files a report", async () => {
    const project = await createProject();
    await actAs(await createUser({ role: "MANAGER" }));
    await expect(createOwnReport(reportInput(project))).resolves.toEqual(forbidden);
  });

  it("does not let an employee file a report for a worker", async () => {
    const project = await createProject();
    const colleague = await createUser({ role: "EMPLOYEE" });
    await actAs(await createUser({ role: "EMPLOYEE" }));
    await expect(createReport({ ...reportInput(project), userId: colleague.id })).resolves.toEqual(
      forbidden,
    );
  });
});

describe("filing a report for a worker", () => {
  it("writes the worker's report with the manager as the one who made it", async () => {
    const project = await createProject();
    const worker = await contractorAccount({ isActive: true });
    const manager = await createUser({ role: "MANAGER" });
    await actAs(manager);

    const result = await createReport({ ...reportInput(project), userId: worker.id });

    expect(result).toMatchObject({ ok: true });
    const report = await reportRow((result as { id: string }).id);
    expect(report).toMatchObject({ userId: worker.id, createdById: manager.id });
    expect(report.contractorId).not.toBeNull();
  });

  it("refuses an inactive worker, an administrator and a contractor without an organisation", async () => {
    const project = await createProject();
    const admin = await createUser({ role: "ADMIN" });
    await actAs(await createUser({ role: "MANAGER" }));

    const inactive = await createUser({ role: "EMPLOYEE", isActive: false });
    await expect(createReport({ ...reportInput(project), userId: inactive.id })).resolves.toEqual(
      workerError("workerInvalid"),
    );
    await expect(createReport({ ...reportInput(project), userId: admin.id })).resolves.toEqual(
      workerError("workerInvalid"),
    );
    const unlinked = await contractorAccount(null);
    await expect(createReport({ ...reportInput(project), userId: unlinked.id })).resolves.toEqual(
      workerError("workerNoOrganization"),
    );
    const archived = await contractorAccount({ isActive: false });
    await expect(createReport({ ...reportInput(project), userId: archived.id })).resolves.toEqual(
      workerError("workerOrganizationArchived"),
    );
    expect(await db.workReport.count()).toBe(0);
  });
});

describe("the date and the project of a report", () => {
  it("refuses a closed project", async () => {
    const project = await createProject({ status: "CLOSED" });
    await actAs(await createUser({ role: "EMPLOYEE" }));
    await expect(createOwnReport(reportInput(project))).resolves.toEqual(closed);
  });

  it("refuses a date in the future and one before the start of the project", async () => {
    const project = await createProject({ startDate: "2026-03-05" });
    await actAs(await createUser({ role: "EMPLOYEE" }));
    const tomorrow = displayTodayIso(Date.now() + 24 * 60 * 60 * 1000);

    await expect(createOwnReport(reportInput(project, { workDate: tomorrow }))).resolves.toEqual({
      ok: false,
      fieldErrors: { workDate: ["reports.validation.workDateInFuture"] },
    });
    await expect(
      createOwnReport(reportInput(project, { workDate: "2026-03-04" })),
    ).resolves.toEqual({
      ok: false,
      fieldErrors: { workDate: ["reports.errors.beforeProjectStart"] },
      errorValues: { date: "05.03.2026" },
    });
    await expect(
      createOwnReport(reportInput(project, { workDate: "2026-03-05" })),
    ).resolves.toMatchObject({ ok: true });
  });
});

describe("overlapping reports", () => {
  it("refuses an overlap with a link to the report in the way, and lets reports meet", async () => {
    const project = await createProject();
    const worker = await createUser({ role: "EMPLOYEE" });
    const first = await filedBy(worker, project);

    await expect(
      createOwnReport(reportInput(project, { startTime: "11:00", endTime: "13:00" })),
    ).resolves.toEqual({
      ok: false,
      fieldErrors: { startTime: ["reports.errors.overlap"] },
      errorValues: { start: "08:00", end: "12:00", number: project.number, reportId: first },
    });
    expect(
      t("reports.errors.overlap", { start: "08:00", end: "12:00", number: project.number }),
    ).toBe(`Пересекается с отчётом 08:00–12:00 по проекту ${project.number}`);

    await expect(
      createOwnReport(reportInput(project, { startTime: "12:00", endTime: "16:30" })),
    ).resolves.toMatchObject({ ok: true });
  });

  it("lets another worker report the same time", async () => {
    const project = await createProject();
    await filedBy(await createUser({ role: "EMPLOYEE" }), project);
    await expect(filedBy(await createUser({ role: "EMPLOYEE" }), project)).resolves.toEqual(
      expect.any(String),
    );
  });

  it("refuses an edit that makes two reports overlap, not the report overlapping itself", async () => {
    const project = await createProject();
    const worker = await createUser({ role: "EMPLOYEE" });
    const morning = await filedBy(worker, project);
    const afternoon = await filedBy(worker, project, { startTime: "13:00", endTime: "17:00" });

    await expect(
      updateReport(afternoon, reportInput(project, { startTime: "11:30", endTime: "17:00" })),
    ).resolves.toMatchObject({ errorValues: { reportId: morning } });
    await expect(
      updateReport(afternoon, reportInput(project, { startTime: "12:00", endTime: "17:30" })),
    ).resolves.toEqual({ ok: true });
  });

  it("frees the time of a deleted report", async () => {
    const project = await createProject();
    const worker = await createUser({ role: "EMPLOYEE" });
    const id = await filedBy(worker, project);

    await expect(deleteReport(id)).resolves.toEqual({ ok: true });
    await expect(createOwnReport(reportInput(project))).resolves.toMatchObject({ ok: true });
  });
});

describe("editing a report", () => {
  it("lets a worker edit an unapproved report of their own, not an approved one", async () => {
    const project = await createProject();
    const worker = await createUser({ role: "EMPLOYEE" });
    const id = await filedBy(worker, project);

    await expect(updateReport(id, reportInput(project, { mileageKm: "10" }))).resolves.toEqual({
      ok: true,
    });

    // Opened before the approval, sent after it.
    await approve(id, await createUser({ role: "MANAGER" }));
    await expect(updateReport(id, reportInput(project, { mileageKm: "12" }))).resolves.toEqual(
      approved,
    );
    expect((await reportRow(id)).mileageKm).toBe(10);
    await expect(deleteReport(id)).resolves.toEqual(approved);
  });

  it("finds nothing of another worker's report, colleagues of one organisation included", async () => {
    const project = await createProject();
    const id = await filedBy(await contractorAccount({ isActive: true }), project);
    const colleague = await createUser({ role: "CONTRACTOR" });
    await db.user.update({
      where: { id: colleague.id },
      data: { contractorId: (await reportRow(id)).contractorId },
    });
    await actAs(colleague);

    await expect(getReportForEdit(colleague, id)).resolves.toBeNull();
    await expect(updateReport(id, reportInput(project))).resolves.toEqual(notFound);
    await expect(deleteReport(id)).resolves.toEqual(notFound);
  });

  it("lets a manager edit an approved report, which stays approved", async () => {
    const project = await createProject();
    const id = await filedBy(await createUser({ role: "EMPLOYEE" }), project);
    const manager = await createUser({ role: "MANAGER" });
    await approve(id, manager);
    await actAs(manager);

    await expect(updateReport(id, reportInput(project, { lunchMinutes: "30" }))).resolves.toEqual({
      ok: true,
    });
    expect(await reportRow(id)).toMatchObject({ status: "APPROVED", lunchMinutes: 30 });
  });

  it("does not take a new worker", async () => {
    const project = await createProject();
    const id = await filedBy(await createUser({ role: "EMPLOYEE" }), project);
    const other = await createUser({ role: "EMPLOYEE" });
    await actAs(await createUser({ role: "MANAGER" }));

    await expect(
      updateReport(id, { ...reportInput(project), userId: other.id }),
    ).resolves.toMatchObject({ ok: false, error: "reports.validation.unexpectedField" });
  });

  it("changes nothing in a closed project, and again after it is back in progress", async () => {
    const project = await createProject();
    const worker = await createUser({ role: "EMPLOYEE" });
    const id = await filedBy(worker, project);
    await db.project.update({ where: { id: project.id }, data: closing });

    await expect(updateReport(id, reportInput(project, { mileageKm: "5" }))).resolves.toEqual(
      closed,
    );
    await expect(deleteReport(id)).resolves.toEqual(closed);

    // Moving a report out of a closed project is a change of it as well.
    const other = await createProject();
    await expect(updateReport(id, reportInput(other))).resolves.toEqual(closed);

    await db.project.update({ where: { id: project.id }, data: reopening });
    await expect(updateReport(id, reportInput(project, { mileageKm: "5" }))).resolves.toEqual({
      ok: true,
    });
  });

  it("writes nothing for an unchanged form", async () => {
    const project = await createProject();
    const worker = await createUser({ role: "EMPLOYEE" });
    const id = await filedBy(worker, project);
    const entries = (await auditEntries()).length;

    const report = await getReportForEdit(worker, id);
    await expect(updateReport(id, reportFormValues(report))).resolves.toEqual({ ok: true });
    expect(await auditEntries()).toHaveLength(entries);
  });
});

describe("deleting a report", () => {
  it("is refused to a manager for an approved report", async () => {
    const project = await createProject();
    const id = await filedBy(await createUser({ role: "EMPLOYEE" }), project);
    const manager = await createUser({ role: "MANAGER" });
    await approve(id, manager);
    await actAs(manager);

    await expect(deleteReport(id)).resolves.toEqual({
      ok: false,
      error: "reports.errors.approvedNotDeleted",
    });
    expect((await reportRow(id)).deletedAt).toBeNull();
  });

  it("deletes softly, and the report is not found any more", async () => {
    const project = await createProject();
    const worker = await createUser({ role: "EMPLOYEE" });
    const id = await filedBy(worker, project);
    await actAs(await createUser({ role: "MANAGER" }));

    await expect(deleteReport(id)).resolves.toEqual({ ok: true });
    expect((await reportRow(id)).deletedAt).not.toBeNull();
    await expect(deleteReport(id)).resolves.toEqual(notFound);
  });
});

describe("the audit log of reports", () => {
  it("writes readable values when a manager files, edits and deletes a report", async () => {
    const project = await createProject();
    const worker = await contractorAccount({ isActive: true });
    const manager = await createUser({ role: "MANAGER", login: "petrov" });
    await actAs(manager);

    const created = await createReport({
      ...reportInput(project, { lunchMinutes: "30" }),
      userId: worker.id,
    });
    const id = (created as { id: string }).id;
    await updateReport(id, reportInput(project, { endTime: "12:30", lunchMinutes: "30" }));
    await deleteReport(id);

    const entries = (await auditEntries()).filter((entry) => entry.entity === "WorkReport");
    expect(
      entries.map(({ action, actorLogin, entityId }) => ({ action, actorLogin, entityId })),
    ).toEqual([
      { action: "CREATE", actorLogin: "petrov", entityId: id },
      { action: "UPDATE", actorLogin: "petrov", entityId: id },
      { action: "DELETE", actorLogin: "petrov", entityId: id },
    ]);

    const [create, update, remove] = entries;
    expect(create.summary).toBe(`Внесён отчёт Jansen P. за 10.03.2026, проект ${project.number}`);
    expect(create.changes).toEqual(
      expect.arrayContaining([
        { field: "user", before: null, after: "Jansen Piet" },
        { field: "contractor", before: null, after: "Bouwbedrijf Jansen" },
        { field: "project", before: null, after: `${project.number} «${project.name}»` },
        { field: "workDate", before: null, after: "10.03.2026" },
        { field: "workDescription", before: null, after: "Stucwerk plafond" },
        { field: "startMinute", before: null, after: "08:00" },
        { field: "endMinute", before: null, after: "12:00" },
        { field: "lunchMinutes", before: null, after: "30 мин" },
        { field: "mileageKm", before: null, after: "42 км" },
        { field: "status", before: null, after: "Не утверждён" },
      ]),
    );
    expect(update.changes).toEqual([{ field: "endMinute", before: "12:00", after: "12:30" }]);
    expect(remove.summary).toBe(`Отчёт Jansen P. за 10.03.2026, проект ${project.number} удалён`);
  });
});
