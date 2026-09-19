import { describe, expect, it } from "vitest";

import { reportAccess } from "@/features/reports/columns";
import { parseReportsListParams } from "@/features/reports/list-params";
import {
  getProjectReportTotals,
  listProjectParticipants,
  listReportFilterOptions,
  listReports,
} from "@/features/reports/queries";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { PermissionDeniedError } from "@/lib/permissions";

import { createUser, type TestUser } from "./helpers";

// The "Отчёты" and "Участники" tabs of a project card (docs/ТЗ.md, 7.11;
// docs/ПРАВА-ДОСТУПА.md, rule 20).

let sequence = 0;

async function createProject(budgetHours: string | null = null) {
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
      budgetHours,
    },
    select: { id: true },
  });
}

type Project = Awaited<ReturnType<typeof createProject>>;

async function createContractor(name: string) {
  const { id } = await db.contractor.create({ data: { name }, select: { id: true } });
  return id;
}

type NewReport = {
  day?: number;
  start?: string;
  end?: string;
  lunch?: number;
  mileageKm?: number;
  approvedBy?: TestUser;
  contractorId?: string | null;
  deleted?: boolean;
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
    workDescription: "Stucwerk plafond",
    startMinute: minutes(report.start ?? "08:00"),
    endMinute: minutes(report.end ?? "12:00"),
    lunchMinutes: report.lunch ?? 0,
    mileageKm: report.mileageKm ?? 0,
    ...(report.approvedBy
      ? { status: "APPROVED", approvedAt: new Date(), approvedById: report.approvedBy.id }
      : {}),
    ...(report.deleted ? { deletedAt: new Date() } : {}),
    createdById: worker.id,
    updatedById: worker.id,
  } satisfies Prisma.WorkReportUncheckedCreateInput;
  const { id } = await db.workReport.create({ data, select: { id: true } });
  return id;
}

describe("the totals of a project's reports", () => {
  it("counts the approved and all reports of the project, but not deleted ones", async () => {
    const project = await createProject();
    const other = await createProject();
    const manager = await createUser({ role: "MANAGER" });
    const worker = await createUser({ role: "EMPLOYEE" });
    // 3,50 h and 12 km approved; 8,00 h and 30 km in all.
    await addReport(worker, project, {
      day: 2,
      end: "12:00",
      lunch: 30,
      mileageKm: 12,
      approvedBy: manager,
    });
    await addReport(worker, project, { day: 3, start: "07:30", end: "12:00", mileageKm: 18 });
    await addReport(worker, project, { day: 4, mileageKm: 100, deleted: true });
    await addReport(worker, project, {
      day: 5,
      mileageKm: 100,
      deleted: true,
      approvedBy: manager,
    });
    await addReport(worker, other, { day: 6, mileageKm: 100, approvedBy: manager });

    const totals = await getProjectReportTotals(manager, project.id);
    expect(totals).toMatchObject({
      count: 2,
      approvedMinutes: 210,
      minutes: 480,
      approvedMileageKm: 12,
      mileageKm: 30,
    });

    // The totals match the sum of the project's reports on its tab, whatever the table's filters.
    const { rows } = await listReports(manager, {
      ...parseReportsListParams(
        new URLSearchParams({ status: "all" }),
        reportAccess(manager),
        "project",
      ),
      projectId: project.id,
    });
    expect(rows.reduce((sum, row) => sum + row.workedMinutes, 0)).toBe(totals.minutes);
    expect(rows.reduce((sum, row) => sum + row.mileageKm, 0)).toBe(totals.mileageKm);
  });

  it("gives an employee or a contractor the totals of their own reports only", async () => {
    const project = await createProject("100.00");
    const manager = await createUser({ role: "MANAGER" });
    const contractorId = await createContractor("Bouw Jansen B.V.");
    const worker = await createUser({ role: "CONTRACTOR" });
    const colleague = await createUser({ role: "CONTRACTOR" });
    await addReport(worker, project, { contractorId, mileageKm: 5, approvedBy: manager });
    await addReport(colleague, project, { contractorId, mileageKm: 50 });

    const own = await getProjectReportTotals(worker, project.id);
    expect(own).toMatchObject({ count: 1, minutes: 240, approvedMinutes: 240, mileageKm: 5 });
    expect((await getProjectReportTotals(manager, project.id)).count).toBe(2);
  });

  it("compares the approved hours with the budget of hours", async () => {
    const project = await createProject("10.00");
    const manager = await createUser({ role: "MANAGER" });
    const worker = await createUser({ role: "EMPLOYEE" });
    await addReport(worker, project, { day: 2, approvedBy: manager });
    // Unapproved hours do not use the budget, however many.
    await addReport(worker, project, { day: 3, start: "06:00", end: "23:00" });

    expect((await getProjectReportTotals(manager, project.id)).budget).toEqual({
      hours: "10.00",
      use: { exceeded: false, percent: 40 },
    });

    await addReport(worker, project, { day: 4, start: "06:00", end: "14:30", approvedBy: manager });
    expect((await getProjectReportTotals(manager, project.id)).budget).toEqual({
      hours: "10.00",
      use: { exceeded: true, excess: "2,50" },
    });
  });

  it("gives no comparison to a project without a budget of hours", async () => {
    const project = await createProject();
    const manager = await createUser({ role: "MANAGER" });

    expect((await getProjectReportTotals(manager, project.id)).budget).toBeNull();
  });

  it("does not read the budget of hours without projects.budget.read", async () => {
    const project = await createProject("10.00");
    const worker = await createUser({ role: "EMPLOYEE" });
    await addReport(worker, project);

    for (const role of ["EMPLOYEE", "CONTRACTOR"] as const) {
      const reader = role === "EMPLOYEE" ? worker : await createUser({ role });
      const totals = await getProjectReportTotals(reader, project.id);
      expect(totals).not.toHaveProperty("budget");
      expect(JSON.stringify(totals)).not.toContain("10.00");
    }
  });
});

describe("the reports tab of a project", () => {
  it("takes the project from the page, not from the URL, and offers only its workers", async () => {
    const project = await createProject();
    const other = await createProject();
    const manager = await createUser({ role: "MANAGER" });
    const worker = await createUser({ role: "EMPLOYEE" });
    const stranger = await createUser({ role: "EMPLOYEE" });
    await addReport(worker, project);
    await addReport(stranger, other);

    const params = parseReportsListParams(
      new URLSearchParams({ status: "all", project: other.id, org: "company" }),
      reportAccess(manager),
      "project",
    );
    expect(params).toMatchObject({ projectId: null, organization: null });

    const options = await listReportFilterOptions(manager, "Наша компания", project.id);
    expect(options.projects).toBeNull();
    expect(options.organizations).toBeNull();
    expect(options.workers?.map((option) => option.id)).toEqual([worker.id]);
  });
});

describe("the participants of a project", () => {
  it("groups the workers by the organisation of their reports, the company's own last", async () => {
    const project = await createProject();
    const manager = await createUser({ role: "MANAGER" });
    const zuid = await createContractor("Zuid Bouw B.V.");
    const jansen = await createContractor("Bouw Jansen B.V.");
    const mover = await createUser({ role: "CONTRACTOR", fullName: "Visser Jan" });
    const employee = await createUser({ role: "EMPLOYEE", fullName: "Bakker Piet" });

    await db.user.update({ where: { id: mover.id }, data: { contractorId: zuid } });
    await addReport(mover, project, {
      day: 2,
      contractorId: zuid,
      mileageKm: 10,
      approvedBy: manager,
    });
    await addReport(mover, project, { day: 3, contractorId: zuid, end: "10:00", mileageKm: 4 });
    // The worker moves to another contractor: the earlier reports stay with the first one.
    await db.user.update({ where: { id: mover.id }, data: { contractorId: jansen } });
    await addReport(mover, project, { day: 9, contractorId: jansen, mileageKm: 7 });
    await addReport(employee, project, { day: 4, approvedBy: manager });
    await addReport(employee, project, { day: 5, deleted: true });

    const groups = await listProjectParticipants(manager, project.id);
    expect(
      groups.map((group) => ({
        organization: group.organization?.name ?? null,
        workers: group.participants.map((participant) => participant.worker.id),
        totals: group.totals,
      })),
    ).toEqual([
      {
        organization: "Bouw Jansen B.V.",
        workers: [mover.id],
        totals: {
          reports: 1,
          approvedMinutes: 0,
          minutes: 240,
          mileageKm: 7,
          lastWorkDate: new Date("2026-03-09T00:00:00Z"),
        },
      },
      {
        organization: "Zuid Bouw B.V.",
        workers: [mover.id],
        totals: {
          reports: 2,
          approvedMinutes: 240,
          minutes: 360,
          mileageKm: 14,
          lastWorkDate: new Date("2026-03-03T00:00:00Z"),
        },
      },
      {
        organization: null,
        workers: [employee.id],
        totals: {
          reports: 1,
          approvedMinutes: 240,
          minutes: 240,
          mileageKm: 0,
          lastWorkDate: new Date("2026-03-04T00:00:00Z"),
        },
      },
    ]);
    expect(groups[0].participants[0].worker).toMatchObject({
      fullName: "Visser Jan",
      nickname: mover.login,
    });
  });

  it("is not given to a reader without projects.participants", async () => {
    const project = await createProject();
    const worker = await createUser({ role: "EMPLOYEE" });
    await addReport(worker, project);

    for (const role of ["EMPLOYEE", "CONTRACTOR"] as const) {
      const reader = await createUser({ role });
      await expect(listProjectParticipants(reader, project.id)).rejects.toThrow(
        PermissionDeniedError,
      );
    }
  });
});
