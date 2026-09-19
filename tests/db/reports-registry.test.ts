import { describe, expect, it } from "vitest";

import {
  approveReport,
  approveReports,
  unapproveReport,
  updateReport,
} from "@/features/reports/actions";
import { reportAccess } from "@/features/reports/columns";
import { parseReportsListParams } from "@/features/reports/list-params";
import { getReport, listReportFilterOptions, listReports } from "@/features/reports/queries";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

import { actAs, auditEntries, createUser, type TestUser } from "./helpers";

// The registry, the card and the approval of work reports (docs/ТЗ.md, 7.7, 7.9–7.10, 7.14;
// docs/ПРАВА-ДОСТУПА.md, rules 16, 18, 21), with the actions called directly as a request that
// bypasses the interface would.

const forbidden = { ok: false, error: "errors.forbiddenAction" };
const closed = { ok: false, error: "projects.errors.closed" };
const notFound = { ok: false, error: "reports.errors.notFound" };
const statusChanged = { ok: false, error: "reports.errors.statusChanged" };

let sequence = 0;

async function createProject(status: "IN_PROGRESS" | "CLOSED" = "IN_PROGRESS") {
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
      startDate: new Date("2026-03-01T00:00:00Z"),
      ...(status === "CLOSED" ? { status, closedAt: new Date() } : {}),
    },
    select: { id: true, number: true, name: true },
  });
}

type Project = Awaited<ReturnType<typeof createProject>>;

async function contractorAccounts(count: number) {
  const { id: contractorId } = await db.contractor.create({ data: { name: "Bouw Jansen B.V." } });
  const users: TestUser[] = [];
  for (let index = 0; index < count; index += 1) {
    const user = await createUser({ role: "CONTRACTOR" });
    await db.user.update({ where: { id: user.id }, data: { contractorId } });
    users.push(user);
  }
  return { contractorId, users };
}

type NewReport = {
  day?: number;
  start?: string;
  end?: string;
  lunch?: number;
  mileageKm?: number;
  approvedBy?: TestUser;
  contractorId?: string | null;
  workDescription?: string;
};

const minutes = (time: string) => {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
};

async function addReport(worker: TestUser, project: Project, report: NewReport = {}) {
  const data = {
    userId: worker.id,
    contractorId: report.contractorId ?? null,
    projectId: project.id,
    workDate: new Date(`2026-03-${String(report.day ?? 10).padStart(2, "0")}T00:00:00Z`),
    workDescription: report.workDescription ?? "Stucwerk plafond",
    startMinute: minutes(report.start ?? "08:00"),
    endMinute: minutes(report.end ?? "12:00"),
    lunchMinutes: report.lunch ?? 0,
    mileageKm: report.mileageKm ?? 0,
    ...(report.approvedBy
      ? { status: "APPROVED", approvedAt: new Date(), approvedById: report.approvedBy.id }
      : {}),
    createdById: worker.id,
    updatedById: worker.id,
  } satisfies Prisma.WorkReportUncheckedCreateInput;
  const { id } = await db.workReport.create({ data, select: { id: true } });
  return id;
}

function list(user: TestUser, query: Record<string, string> = {}) {
  return listReports(user, parseReportsListParams(new URLSearchParams(query), reportAccess(user)));
}

const formOf = (project: Project, changes: Record<string, string> = {}) => ({
  projectId: project.id,
  workDate: "2026-03-10",
  workDescription: "Stucwerk plafond",
  startTime: "08:00",
  endTime: "12:00",
  lunchMinutes: "0",
  mileageKm: "0",
  ...changes,
});

describe("whose reports a user sees", () => {
  it("hides a colleague's report from a contractor's worker, in the registry and by id", async () => {
    const project = await createProject();
    const { contractorId, users } = await contractorAccounts(2);
    const [worker, colleague] = users;
    const own = await addReport(worker, project, { contractorId });
    const other = await addReport(colleague, project, { contractorId, workDescription: "Tegels" });

    const { rows, totals } = await list(worker, { status: "all" });
    expect(rows.map((row) => row.id)).toEqual([own]);
    expect(totals.count).toBe(1);
    // A search for the colleague's work or filters from the URL do not widen the list.
    expect((await list(worker, { q: "Tegels" })).rows).toEqual([]);
    expect((await list(worker, { worker: colleague.id, org: contractorId })).rows).toHaveLength(1);

    expect(await getReport(worker, other)).toBeNull();
    expect(await getReport(worker, own)).toMatchObject({ id: own });

    await actAs(worker);
    await expect(updateReport(other, formOf(project))).resolves.toEqual(notFound);
  });

  it("gives a worker neither the worker nor the organisation of the rows", async () => {
    const project = await createProject();
    const worker = await createUser({ role: "EMPLOYEE" });
    await addReport(worker, project);

    const [row] = (await list(worker)).rows;
    expect(row).not.toHaveProperty("worker");
    expect(row).not.toHaveProperty("organization");
    expect((await listReportFilterOptions(worker, "Наша компания")).workers).toBeNull();
  });

  it("forgets a deleted report", async () => {
    const project = await createProject();
    const manager = await createUser({ role: "MANAGER" });
    const id = await addReport(await createUser({ role: "EMPLOYEE" }), project);
    await db.workReport.update({ where: { id }, data: { deletedAt: new Date() } });

    expect((await list(manager, { status: "all" })).rows).toEqual([]);
    expect(await getReport(manager, id)).toBeNull();
  });
});

describe("the registry", () => {
  it("counts the totals over every page, and they match the sum of the rows", async () => {
    const project = await createProject();
    const manager = await createUser({ role: "MANAGER" });
    const worker = await createUser({ role: "EMPLOYEE" });
    // 30 reports of 20 minutes and 3 km each: 10:00 hours, 90 km; 5 of them approved.
    for (let day = 1; day <= 30; day += 1) {
      await addReport(worker, project, {
        day,
        start: "08:00",
        end: "08:20",
        mileageKm: 3,
        approvedBy: day <= 5 ? manager : undefined,
      });
    }

    const firstPage = await list(manager, { status: "all" });
    expect(firstPage.rows).toHaveLength(25);
    expect(firstPage.totals).toEqual({
      count: 30,
      minutes: 600,
      mileageKm: 90,
      approvedMinutes: 100,
      approvedMileageKm: 15,
    });
    const secondPage = await list(manager, { status: "all", page: "2" });
    const rows = [...firstPage.rows, ...secondPage.rows];
    expect(rows.reduce((sum, row) => sum + row.workedMinutes, 0)).toBe(600);

    // Every role starts from all statuses; the queue to approve is a filter away.
    expect((await list(manager)).totals).toMatchObject({ count: 30, minutes: 600 });
    expect((await list(manager, { status: "unapproved" })).totals).toMatchObject({
      count: 25,
      minutes: 500,
    });
  });

  it("filters by the period, the organisation, the worker and the mileage", async () => {
    const project = await createProject();
    const manager = await createUser({ role: "MANAGER" });
    const { contractorId, users } = await contractorAccounts(1);
    const employee = await createUser({ role: "EMPLOYEE", nickname: "Aad" });
    const long = await addReport(users[0], project, {
      day: 5,
      end: "16:30",
      lunch: 30,
      contractorId,
    });
    const short = await addReport(employee, project, { day: 12, end: "09:00", mileageKm: 25 });
    const ids = async (query: Record<string, string>) =>
      (await list(manager, query)).rows.map((row) => row.id);

    expect((await list(manager, { from: "2026-03-06" })).rows.map((row) => row.id)).toEqual([
      short,
    ]);
    expect((await list(manager, { org: "company" })).rows.map((row) => row.id)).toEqual([short]);
    expect((await list(manager, { org: contractorId })).rows.map((row) => row.id)).toEqual([long]);
    expect((await list(manager, { worker: users[0].id })).rows.map((row) => row.id)).toEqual([
      long,
    ]);

    expect(await ids({ km: "none" })).toEqual([long]);
    expect(await ids({ km: "some" })).toEqual([short]);
    expect(await ids({ km: "range", kmFrom: "20", kmTo: "25" })).toEqual([short]);
    expect(await ids({ km: "range", kmTo: "24" })).toEqual([long]);
    // A range without the "range" choice, or out of bounds, narrows nothing.
    expect(await ids({ kmFrom: "20" })).toEqual([short, long]);
    expect(await ids({ km: "range", kmFrom: "2001" })).toEqual([short, long]);

    const options = await listReportFilterOptions(manager, "Наша компания");
    expect(options.organizations?.map((option) => option.id)).toEqual([contractorId, "company"]);
    // Workers are chosen by the nickname, and listed in its order.
    expect(options.workers?.map((option) => option.name)).toEqual([
      "Aad (" + employee.fullName + ")",
      `${users[0].login} (${users[0].fullName})`,
    ]);
  });

  it("sorts by the date only, and shows the worker's nickname", async () => {
    const project = await createProject();
    const manager = await createUser({ role: "MANAGER" });
    const first = await createUser({ role: "EMPLOYEE", nickname: "Zeb" });
    const second = await createUser({ role: "EMPLOYEE", nickname: "Aad", fullName: "Zwart Aad" });
    const late = await addReport(first, project, { day: 12, end: "09:00", mileageKm: 90 });
    const early = await addReport(second, project, { day: 5, end: "16:00" });
    const ids = async (query: Record<string, string>) =>
      (await list(manager, { status: "all", ...query })).rows.map((row) => row.id);

    expect(await ids({ sort: "workDate", order: "asc" })).toEqual([early, late]);
    expect(await ids({ sort: "workDate", order: "desc" })).toEqual([late, early]);
    // Any other column falls back to the newest day first.
    for (const sort of ["worker", "project", "hours", "mileageKm", "status", "organization"]) {
      expect(await ids({ sort, order: "asc" })).toEqual([late, early]);
    }

    const [row] = (await list(manager, { status: "all", sort: "workDate", order: "asc" })).rows;
    expect(row).not.toHaveProperty("organization");
    expect(row.worker).toMatchObject({ nickname: "Aad", fullName: "Zwart Aad" });
  });
});

describe("approving a report", () => {
  it("approves once, logs it, and says the status already changed on a second click", async () => {
    const project = await createProject();
    const manager = await createUser({ role: "MANAGER", fullName: "Petrov Pjotr" });
    const id = await addReport(
      await createUser({ role: "EMPLOYEE", fullName: "Ivanov Ivan" }),
      project,
    );
    await actAs(manager);

    await expect(approveReport(id)).resolves.toEqual({ ok: true });
    await expect(approveReport(id)).resolves.toEqual(statusChanged);

    expect(await db.workReport.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: "APPROVED",
      approvedById: manager.id,
      updatedById: manager.id,
    });
    const entries = (await auditEntries()).filter((entry) => entry.entity === "WorkReport");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: "STATUS_CHANGE",
      entityId: id,
      summary: `Отчёт Ivanov I. за 10.03.2026, проект ${project.number} утверждён`,
      changes: [{ field: "status", before: "Не утверждён", after: "Утверждён" }],
    });
  });

  it("is refused to a worker, and in a closed project", async () => {
    const worker = await createUser({ role: "EMPLOYEE" });
    const id = await addReport(worker, await createProject());
    await actAs(worker);
    await expect(approveReport(id)).resolves.toEqual(forbidden);
    await expect(approveReports([id])).resolves.toEqual(forbidden);

    const inClosed = await addReport(worker, await createProject("CLOSED"), { day: 11 });
    await actAs(await createUser({ role: "ADMIN" }));
    await expect(approveReport(inClosed)).resolves.toEqual(closed);
  });

  it("approves the selected reports and skips approved ones and those of a closed project", async () => {
    const open = await createProject();
    const closedProject = await createProject("CLOSED");
    const manager = await createUser({ role: "MANAGER" });
    const worker = await createUser({ role: "EMPLOYEE" });
    const first = await addReport(worker, open, { day: 1 });
    const second = await addReport(worker, open, { day: 2 });
    const approved = await addReport(worker, open, { day: 3, approvedBy: manager });
    const inClosed = await addReport(worker, closedProject, { day: 4 });
    const approvedBefore = await db.workReport.findUniqueOrThrow({ where: { id: approved } });
    await actAs(manager);

    await expect(approveReports([first, second, approved, inClosed])).resolves.toEqual({
      ok: true,
      approved: 2,
      skipped: 2,
    });

    const statuses = await db.workReport.findMany({
      where: { id: { in: [first, second, inClosed] } },
      select: { id: true, status: true },
    });
    expect(Object.fromEntries(statuses.map((row) => [row.id, row.status]))).toEqual({
      [first]: "APPROVED",
      [second]: "APPROVED",
      [inClosed]: "UNAPPROVED",
    });
    expect(await db.workReport.findUniqueOrThrow({ where: { id: approved } })).toEqual(
      approvedBefore,
    );
    const entries = (await auditEntries()).filter((entry) => entry.action === "STATUS_CHANGE");
    expect(entries.map((entry) => entry.entityId).sort()).toEqual([first, second].sort());
  });

  it("refuses an empty or malformed selection", async () => {
    await actAs(await createUser({ role: "MANAGER" }));
    await expect(approveReports([])).resolves.toEqual({
      ok: false,
      error: "errors.invalidRequest",
    });
    await expect(approveReports("all")).resolves.toEqual({
      ok: false,
      error: "errors.invalidRequest",
    });
  });
});

describe("withdrawing an approval", () => {
  it("is refused without a reason", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const id = await addReport(await createUser({ role: "EMPLOYEE" }), await createProject(), {
      approvedBy: manager,
    });
    await actAs(manager);

    for (const reason of ["", "  ", "ok"]) {
      await expect(unapproveReport(id, { reason })).resolves.toEqual({
        ok: false,
        fieldErrors: { reason: ["reports.validation.reasonLength"] },
      });
    }
    expect((await db.workReport.findUniqueOrThrow({ where: { id } })).status).toBe("APPROVED");
    expect(await auditEntries()).toHaveLength(0);
  });

  it("lets the worker edit the report again and see the reason, until it is approved again", async () => {
    const project = await createProject();
    const manager = await createUser({ role: "MANAGER" });
    const worker = await createUser({ role: "EMPLOYEE" });
    const id = await addReport(worker, project, { approvedBy: manager });

    await actAs(worker);
    await expect(updateReport(id, formOf(project, { mileageKm: "12" }))).resolves.toEqual({
      ok: false,
      error: "reports.errors.approved",
    });

    await actAs(manager);
    await expect(unapproveReport(id, { reason: " Пробег не указан " })).resolves.toEqual({
      ok: true,
    });
    await expect(unapproveReport(id, { reason: "Пробег не указан" })).resolves.toEqual(
      statusChanged,
    );

    const [row] = (await list(worker)).rows;
    expect(row).toMatchObject({
      id,
      status: "UNAPPROVED",
      unapproval: { reason: "Пробег не указан", by: { fullName: manager.fullName } },
    });
    // The worker is told who withdrew the approval, not the account to sign in with.
    expect(row.unapproval?.by).not.toHaveProperty("login");

    await actAs(worker);
    await expect(updateReport(id, formOf(project, { mileageKm: "12" }))).resolves.toEqual({
      ok: true,
    });

    await actAs(manager);
    await expect(approveReport(id)).resolves.toEqual({ ok: true });
    expect(await db.workReport.findUniqueOrThrow({ where: { id } })).toMatchObject({
      mileageKm: 12,
      unapprovalReason: null,
      unapprovedAt: null,
      unapprovedById: null,
    });

    const changes = (await auditEntries())
      .filter((entry) => entry.action === "STATUS_CHANGE")
      .map((entry) => entry.changes);
    expect(changes).toEqual([
      [
        { field: "status", before: "Утверждён", after: "Не утверждён" },
        { field: "unapprovalReason", before: null, after: "Пробег не указан" },
      ],
      [
        { field: "status", before: "Не утверждён", after: "Утверждён" },
        { field: "unapprovalReason", before: "Пробег не указан", after: null },
      ],
    ]);
  });
});
