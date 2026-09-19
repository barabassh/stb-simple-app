import { describe, expect, it } from "vitest";

import {
  changeProjectStatus,
  createProject,
  deleteProject,
  updateProject,
} from "@/features/projects/actions";
import { projectFormValues } from "@/features/projects/form-values";
import { getProjectForEdit } from "@/features/projects/queries";
import type { ProjectFormInput } from "@/features/projects/schemas";
import type { Prisma } from "@/generated/prisma/client";
import type { WorkReportStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

import { actAs, createUser, type TestUser } from "./helpers";
import { t } from "./translations";

// The rules a project keeps because of its work reports (docs/ТЗ.md, 6.6–6.7, 7.8). The reports
// are written straight through Prisma: their actions come with the report form.

const nameTaken = { ok: false, fieldErrors: { name: ["projects.errors.nameTaken"] } };
const nameTakenOnReopen = { ok: false, error: "projects.errors.nameTakenOnReopen" };
const hasReports = { ok: false, error: "projects.errors.hasReports" };
const unapproved = (count: number) => ({
  ok: false,
  error: "projects.errors.unapprovedReports",
  errorValues: { count },
});

let customerId: string;
let sequence = 0;

function projectInput(changes: Partial<ProjectFormInput> = {}): ProjectFormInput {
  sequence += 1;
  return {
    number: `2026-${String(sequence).padStart(3, "0")}`,
    name: `Project ${sequence}`,
    customerId,
    address: {
      street: "de Geerenweg",
      houseNumber: "4",
      houseNumberAddition: "",
      postcode: "3741 RS",
      city: "Baarn",
      country: "NL",
    },
    startDate: "2026-03-01",
    description: "",
    budgetAmount: "",
    vatRate: undefined,
    budgetHours: "",
    ...changes,
  };
}

/** A manager or an administrator who goes on acting, with a customer and a worker for reports. */
async function actingAs(role: "MANAGER" | "ADMIN" = "MANAGER") {
  const actor = await createUser({ role });
  await actAs(actor);
  ({ id: customerId } = await db.customer.create({
    data: { type: "COMPANY", name: "Bakker Vastgoed B.V." },
    select: { id: true },
  }));
  worker = await createUser({ role: "EMPLOYEE" });
  return actor;
}

async function created(changes: Partial<ProjectFormInput> = {}) {
  const result = await createProject(projectInput(changes));
  if (!result.ok) throw new Error(`The project was not created: ${JSON.stringify(result)}`);
  return result.id;
}

async function openForm(actor: TestUser, id: string): Promise<ProjectFormInput> {
  const project = await getProjectForEdit(actor, id);
  if (!project) throw new Error("The project is not there");
  return projectFormValues(project);
}

type NewReport = {
  workDate?: string;
  status?: WorkReportStatus;
  deletedAt?: Date;
};

let worker: TestUser;
let reportMinute = 0;

function reportData(projectId: string, report: NewReport = {}) {
  // Every report gets its own hour, so that the reports of the one worker never overlap.
  const startMinute = (reportMinute += 60) % 1380;
  return {
    userId: worker.id,
    projectId,
    workDate: new Date(`${report.workDate ?? "2026-03-10"}T00:00:00Z`),
    workDescription: "Stucwerk",
    startMinute,
    endMinute: startMinute + 30,
    status: report.status ?? "UNAPPROVED",
    approvedAt: report.status === "APPROVED" ? new Date() : null,
    deletedAt: report.deletedAt ?? null,
  } satisfies Prisma.WorkReportUncheckedCreateInput;
}

async function addReport(projectId: string, report: NewReport = {}) {
  await db.workReport.create({ data: reportData(projectId, report) });
}

/**
 * Writes a report the way a report action does (docs/АРХИТЕКТУРА.md, 3.10): the project row is
 * taken FOR SHARE while it is in progress, or the report is refused.
 */
async function writeReportInto(tx: Prisma.TransactionClient, projectId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Project"
    WHERE id = ${projectId} AND status = 'IN_PROGRESS' AND "deletedAt" IS NULL
    FOR SHARE`;
  if (rows.length === 0) return false;
  await tx.workReport.create({ data: reportData(projectId) });
  return true;
}

async function waitingLocks() {
  const [{ count }] = await db.$queryRaw<{ count: number }[]>`
    SELECT count(*)::int AS count FROM pg_locks WHERE NOT granted`;
  return count;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

function projectRow(id: string) {
  return db.project.findUniqueOrThrow({ where: { id } });
}

async function projectAuditCount(id: string) {
  return db.auditLog.count({ where: { entity: "Project", entityId: id } });
}

describe("the name of a project in progress", () => {
  it("is unique ignoring case, as a field error when creating and editing", async () => {
    const actor = await actingAs();
    await created({ name: "Дом" });

    await expect(createProject(projectInput({ name: "дом" }))).resolves.toEqual(nameTaken);

    const other = await created({ name: "Сарай" });
    await expect(
      updateProject(other, { ...(await openForm(actor, other)), name: "ДОМ" }),
    ).resolves.toEqual(nameTaken);
    expect((await projectRow(other)).name).toBe("Сарай");
    expect(t("projects.errors.nameTaken")).toBe("Проект «В работе» с таким названием уже есть");
  });

  it("names both fields when the number and the name are taken", async () => {
    await actingAs();
    await created({ number: "2026-100", name: "Дом" });

    await expect(createProject(projectInput({ number: "2026-100", name: "дом" }))).resolves.toEqual(
      {
        ok: false,
        fieldErrors: {
          number: ["projects.errors.numberTaken"],
          name: ["projects.errors.nameTaken"],
        },
      },
    );
  });

  it("may repeat the name of a closed or a deleted project", async () => {
    await actingAs("ADMIN");
    const closedOne = await created({ name: "Дом" });
    await changeProjectStatus(closedOne, "CLOSED");
    const deletedOne = await created({ name: "дом" });
    await expect(deleteProject(deletedOne)).resolves.toEqual({ ok: true });

    await expect(createProject(projectInput({ name: "ДОМ" }))).resolves.toMatchObject({ ok: true });
  });

  it("keeps a closed project from coming back while its name is taken", async () => {
    await actingAs();
    const closedOne = await created({ name: "Дом" });
    await changeProjectStatus(closedOne, "CLOSED");
    await created({ name: "дом" });
    const entries = await projectAuditCount(closedOne);

    await expect(changeProjectStatus(closedOne, "IN_PROGRESS")).resolves.toEqual(nameTakenOnReopen);
    expect((await projectRow(closedOne)).status).toBe("CLOSED");
    expect(await projectAuditCount(closedOne)).toBe(entries);
    expect(t("projects.errors.nameTakenOnReopen")).toBe(
      "Проект «В работе» с таким названием уже есть — сначала переименуйте один из проектов",
    );
  });
});

describe("closing a project with reports", () => {
  it("is refused while reports are unapproved, naming their number", async () => {
    await actingAs();
    const id = await created();
    await addReport(id);
    await addReport(id);
    await addReport(id, { status: "APPROVED" });
    await addReport(id, { deletedAt: new Date() });

    await expect(changeProjectStatus(id, "CLOSED")).resolves.toEqual(unapproved(2));

    const row = await projectRow(id);
    expect(row).toMatchObject({ status: "IN_PROGRESS", closedAt: null, closedById: null });
    expect(await projectAuditCount(id)).toBe(1);
    expect(t("projects.errors.unapprovedReports", { count: 2 })).toBe(
      "В проекте есть неутверждённые отчёты: 2. Утвердите или удалите их перед закрытием",
    );
    expect(t("projects.errors.unapprovedReports", { count: 1 })).toBe(
      "В проекте есть неутверждённый отчёт: 1. Утвердите или удалите его перед закрытием",
    );
  });

  it("goes through when every report left is approved", async () => {
    await actingAs();
    const id = await created();
    await addReport(id, { status: "APPROVED" });
    await addReport(id, { deletedAt: new Date() });

    await expect(changeProjectStatus(id, "CLOSED")).resolves.toEqual({ ok: true });
    expect((await projectRow(id)).status).toBe("CLOSED");
  });

  it("counts a report written at the same time and committed first", async () => {
    await actingAs();
    const id = await created();

    const written = deferred();
    const release = deferred();
    const report = db.$transaction(async (tx) => {
      const accepted = await writeReportInto(tx, id);
      written.resolve();
      await release.promise;
      return accepted;
    });
    await written.promise;

    const closing = changeProjectStatus(id, "CLOSED");
    // The closing waits for the project row the report holds.
    await expect.poll(waitingLocks, { timeout: 10_000 }).toBeGreaterThan(0);
    release.resolve();

    expect(await report).toBe(true);
    await expect(closing).resolves.toEqual(unapproved(1));
    expect((await projectRow(id)).status).toBe("IN_PROGRESS");
  });

  it("refuses a report written at the same time after the closing", async () => {
    await actingAs();
    const id = await created();

    // Holds the closing after its write of the project row, before it commits: the audit entry
    // it writes last waits for this lock.
    const locked = deferred();
    const unlock = deferred();
    const auditLock = db.$transaction(async (tx) => {
      await tx.$executeRaw`LOCK TABLE "AuditLog" IN SHARE MODE`;
      locked.resolve();
      await unlock.promise;
    });
    await locked.promise;

    const closing = changeProjectStatus(id, "CLOSED");
    await expect.poll(waitingLocks, { timeout: 10_000 }).toBe(1);
    const report = db.$transaction((tx) => writeReportInto(tx, id));
    // The report waits for the project row the closing has written.
    await expect.poll(waitingLocks, { timeout: 10_000 }).toBe(2);
    unlock.resolve();
    await auditLock;

    await expect(closing).resolves.toEqual({ ok: true });
    expect(await report).toBe(false);
    expect(await db.workReport.count()).toBe(0);
    expect((await projectRow(id)).status).toBe("CLOSED");
  });
});

describe("deleting a project with reports", () => {
  it("is refused, even when every report is deleted", async () => {
    await actingAs("ADMIN");
    const id = await created();
    await addReport(id, { deletedAt: new Date() });

    await expect(deleteProject(id)).resolves.toEqual(hasReports);
    expect((await projectRow(id)).deletedAt).toBeNull();
    expect(await projectAuditCount(id)).toBe(1);
    expect(t("projects.errors.hasReports")).toBe(
      "В проекте есть отчёты о работе — его можно только закрыть",
    );
  });
});

describe("the start date of a project with reports", () => {
  it("may not move past the first report that is not deleted", async () => {
    const actor = await actingAs();
    const id = await created({ startDate: "2026-03-01" });
    await addReport(id, { workDate: "2026-03-02", deletedAt: new Date() });
    await addReport(id, { workDate: "2026-03-05" });
    await addReport(id, { workDate: "2026-03-09" });
    const form = await openForm(actor, id);

    await expect(updateProject(id, { ...form, startDate: "2026-03-06" })).resolves.toEqual({
      ok: false,
      fieldErrors: { startDate: ["projects.errors.reportsBeforeStart"] },
      errorValues: { date: "05.03.2026" },
    });
    expect((await projectRow(id)).startDate).toEqual(new Date("2026-03-01T00:00:00Z"));
    expect(await projectAuditCount(id)).toBe(1);
    expect(t("projects.errors.reportsBeforeStart", { date: "05.03.2026" })).toBe(
      "Есть отчёты раньше этой даты: первый — 05.03.2026",
    );

    await expect(updateProject(id, { ...form, startDate: "2026-03-05" })).resolves.toEqual({
      ok: true,
    });
    expect((await projectRow(id)).startDate).toEqual(new Date("2026-03-05T00:00:00Z"));
  });
});
