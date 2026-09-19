import type { SortOrder } from "@/components/data-table/search-params";
import type { RecordOption } from "@/components/reference-book/record-picker";
import { readTableSettings } from "@/features/preferences/store";
import type { Prisma } from "@/generated/prisma/client";
import type { WorkReportStatus } from "@/generated/prisma/enums";
import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  can,
  canAny,
  PermissionDeniedError,
  REPORTS_SECTION,
  requirePermission,
} from "@/lib/permissions";

import {
  DEFAULT_REPORT_SORT,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  REPORT_COLUMNS,
  reportAccess,
  reportSortColumns,
  type ReportAccess,
  type ReportColumn,
  type ReportSortColumn,
} from "./columns";
import { OUR_COMPANY, type ReportFilters, type ReportsListParams } from "./list-params";
import { hoursBudgetUse, workedMinutes, type HoursBudgetUse } from "./time";

/** Filing and changing reports: of any worker, or only of one's own. */
export const REPORTS_WRITE = ["reports.write", "reports.writeOwn"] as const;

const calendarDay = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`);

/**
 * The reports a user may see, narrowed by the registry's filters (docs/ПРАВА-ДОСТУПА.md, rule 16).
 * Without reports.read only those where the worker is the user, whatever the filters say, and the
 * worker and the organisation are neither filters nor searched. Every query of reports starts from
 * it — the registry, its totals, one report, the actions — so another worker's report, or a
 * deleted one, is simply not found.
 */
export function reportsWhere(
  actor: Pick<SessionUser, "id" | "role">,
  filters: Partial<ReportFilters> = {},
): Prisma.WorkReportWhereInput {
  const { all } = reportAccess(actor);
  const conditions: Prisma.WorkReportWhereInput[] = [
    { deletedAt: null },
    ...(all ? [] : [{ userId: actor.id }]),
  ];

  if (filters.status === "unapproved") conditions.push({ status: "UNAPPROVED" });
  if (filters.status === "approved") conditions.push({ status: "APPROVED" });
  if (filters.projectId) conditions.push({ projectId: filters.projectId });
  if (all && filters.organization) {
    conditions.push({
      contractorId: filters.organization === OUR_COMPANY ? null : filters.organization,
    });
  }
  if (all && filters.workerId) conditions.push({ userId: filters.workerId });
  if (filters.from) conditions.push({ workDate: { gte: calendarDay(filters.from) } });
  if (filters.to) conditions.push({ workDate: { lte: calendarDay(filters.to) } });
  if (filters.mileage === "none") conditions.push({ mileageKm: 0 });
  if (filters.mileage === "some") conditions.push({ mileageKm: { gt: 0 } });
  if (filters.mileage === "range") {
    if (filters.mileageFrom != null) conditions.push({ mileageKm: { gte: filters.mileageFrom } });
    if (filters.mileageTo != null) conditions.push({ mileageKm: { lte: filters.mileageTo } });
  }
  if (filters.query) {
    const contains = { contains: filters.query, mode: "insensitive" } as const;
    conditions.push({
      OR: [
        { workDescription: contains },
        { project: { number: contains } },
        { project: { name: contains } },
        ...(all ? [{ user: { fullName: contains } }, { user: { nickname: contains } }] : []),
      ],
    });
  }

  return { AND: conditions };
}

/**
 * Why the user may not file a report of their own: a contractor account files reports on behalf of
 * an active organisation (docs/ТЗ.md, 7.3). Null when nothing stands in the way. The key is the
 * message shown instead of the "Новый отчёт" button and returned by the action that refuses it.
 */
export type OwnReportBlock =
  "reports.errors.noOrganization" | "reports.errors.organizationArchived";

export async function getOwnReportBlock(actor: SessionUser): Promise<OwnReportBlock | null> {
  requirePermission(actor, "reports.writeOwn");
  if (actor.role !== "CONTRACTOR") return null;

  const { contractor } = await db.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: { contractor: { select: { isActive: true } } },
  });
  if (!contractor) return "reports.errors.noOrganization";
  return contractor.isActive ? null : "reports.errors.organizationArchived";
}

export type ReportForEdit = {
  id: string;
  status: WorkReportStatus;
  worker: { fullName: string; nickname: string };
  /** Null for the company's own employee. */
  organization: string | null;
  project: { id: string; number: string; name: string; inProgress: boolean };
  /** `yyyy-MM-dd`. */
  workDate: string;
  workDescription: string;
  startMinute: number;
  endMinute: number;
  lunchMinutes: number;
  mileageKm: number;
};

export async function getReportForEdit(
  actor: SessionUser,
  id: string,
): Promise<ReportForEdit | null> {
  if (!canAny(actor, REPORTS_WRITE)) throw new PermissionDeniedError("reports.writeOwn");

  const report = await db.workReport.findFirst({
    where: { id, ...reportsWhere(actor) },
    select: {
      id: true,
      status: true,
      user: { select: { fullName: true, nickname: true } },
      contractor: { select: { name: true } },
      project: {
        select: { id: true, number: true, name: true, status: true, deletedAt: true },
      },
      workDate: true,
      workDescription: true,
      startMinute: true,
      endMinute: true,
      lunchMinutes: true,
      mileageKm: true,
    },
  });
  if (!report) return null;

  const { user, contractor, project, workDate, ...rest } = report;
  return {
    ...rest,
    worker: user,
    organization: contractor?.name ?? null,
    project: {
      id: project.id,
      number: project.number,
      name: project.name,
      inProgress: project.status === "IN_PROGRESS" && project.deletedAt === null,
    },
    workDate: workDate.toISOString().slice(0, 10),
  };
}

export type ReportWorkerOption = {
  id: string;
  fullName: string;
  nickname: string;
  /** Null for the company's own employee. */
  organization: string | null;
};

/**
 * The workers an administrator or a manager may file a report for (docs/ТЗ.md, 7.2): active
 * employees, and active contractor accounts of an active organisation. The action checks the
 * choice again.
 */
export async function listReportWorkerOptions(actor: SessionUser): Promise<ReportWorkerOption[]> {
  requirePermission(actor, "reports.write");

  const users = await db.user.findMany({
    where: {
      isActive: true,
      OR: [{ role: "EMPLOYEE" }, { role: "CONTRACTOR", contractor: { isActive: true } }],
    },
    select: { id: true, fullName: true, nickname: true, contractor: { select: { name: true } } },
    orderBy: [{ fullName: "asc" }, { id: "asc" }],
  });

  return users.map(({ contractor, ...user }) => ({
    ...user,
    organization: contractor?.name ?? null,
  }));
}

const personSelect = { select: { fullName: true, login: true } } as const;

const listSelect = {
  id: true,
  userId: true,
  workDate: true,
  user: { select: { id: true, fullName: true, nickname: true } },
  contractor: { select: { id: true, name: true, isActive: true } },
  project: { select: { id: true, number: true, name: true, status: true, deletedAt: true } },
  workDescription: true,
  startMinute: true,
  endMinute: true,
  lunchMinutes: true,
  mileageKm: true,
  status: true,
  unapprovalReason: true,
  unapprovedAt: true,
  unapprovedBy: personSelect,
  updatedAt: true,
} as const satisfies Prisma.WorkReportSelect;

type ReportRow = Prisma.WorkReportGetPayload<{ select: typeof listSelect }>;

/** Null when the account was removed from the record outside the application. */
export type ReportPerson = { fullName: string; login?: string } | null;

export type ReportListItem = {
  id: string;
  workDate: Date;
  /** Absent without reports.read: every report on the list is the reader's own. */
  worker?: { id: string; fullName: string; nickname: string };
  project: { id: string; number: string; name: string; inProgress: boolean };
  workDescription: string;
  startMinute: number;
  endMinute: number;
  lunchMinutes: number;
  workedMinutes: number;
  mileageKm: number;
  status: WorkReportStatus;
  /** Why the approval was withdrawn, until the report is approved again (docs/ТЗ.md, 7.7). */
  unapproval: { reason: string; at: Date; by: ReportPerson } | null;
  updatedAt?: Date;
};

/**
 * Logins are shown only to those who manage every worker's reports: a worker learns who approved
 * or filed the report by name, not the account to sign in with.
 */
function person(
  value: { fullName: string; login: string } | null,
  access: ReportAccess,
): ReportPerson {
  if (!value) return null;
  return access.all ? value : { fullName: value.fullName };
}

type ReportFields = Omit<ReportListItem, "worker" | "updatedAt">;

/** What the registry and the card alike show of a report to every reader. */
function reportFields(row: ReportRow, access: ReportAccess): ReportFields {
  const { project, unapprovalReason, unapprovedAt, unapprovedBy } = row;

  return {
    id: row.id,
    workDate: row.workDate,
    project: {
      id: project.id,
      number: project.number,
      name: project.name,
      inProgress: project.status === "IN_PROGRESS" && project.deletedAt === null,
    },
    workDescription: row.workDescription,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
    lunchMinutes: row.lunchMinutes,
    workedMinutes: workedMinutes(row),
    mileageKm: row.mileageKm,
    status: row.status,
    unapproval:
      unapprovalReason !== null && unapprovedAt !== null
        ? { reason: unapprovalReason, at: unapprovedAt, by: person(unapprovedBy, access) }
        : null,
  };
}

function toListItem(row: ReportRow, access: ReportAccess): ReportListItem {
  const fields = reportFields(row, access);
  if (!access.all) return fields;
  return { ...fields, worker: row.user, updatedAt: row.updatedAt };
}

// A day reads by the start of work; the id keeps rows with equal values from moving between pages.
const ORDER_BY: Record<
  ReportSortColumn,
  (order: SortOrder) => Prisma.WorkReportOrderByWithRelationInput[]
> = {
  workDate: (order) => [{ workDate: order }, { startMinute: "asc" }, { id: "asc" }],
};

type Page = { skip: number; take: number };

async function findReports(
  access: ReportAccess,
  where: Prisma.WorkReportWhereInput,
  table: ReportsListParams["table"],
  page?: Page,
): Promise<ReportListItem[]> {
  const { column, order } =
    table.sort && reportSortColumns(access).includes(table.sort.column)
      ? table.sort
      : DEFAULT_REPORT_SORT;

  const rows = await db.workReport.findMany({
    where,
    select: listSelect,
    orderBy: ORDER_BY[column](order),
    ...page,
  });
  return rows.map((row) => toListItem(row, access));
}

export type ReportTotals = {
  count: number;
  minutes: number;
  mileageKm: number;
  /** The minutes and kilometres of the approved reports among them. */
  approvedMinutes: number;
  approvedMileageKm: number;
};

/**
 * The totals of every page of the filtered list (docs/ТЗ.md, 7.9), summed by the database. The
 * worked minutes of a group are its end minutes less its start and lunch minutes.
 */
async function reportTotals(where: Prisma.WorkReportWhereInput): Promise<ReportTotals> {
  const groups = await db.workReport.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
    _sum: { startMinute: true, endMinute: true, lunchMinutes: true, mileageKm: true },
  });

  const totals: ReportTotals = {
    count: 0,
    minutes: 0,
    mileageKm: 0,
    approvedMinutes: 0,
    approvedMileageKm: 0,
  };
  for (const { status, _count, _sum } of groups) {
    const minutes = sumMinutes(_sum);
    const mileageKm = _sum.mileageKm ?? 0;
    totals.count += _count._all;
    totals.minutes += minutes;
    totals.mileageKm += mileageKm;
    if (status === "APPROVED") {
      totals.approvedMinutes += minutes;
      totals.approvedMileageKm += mileageKm;
    }
  }
  return totals;
}

type MinuteSums = {
  startMinute: number | null;
  endMinute: number | null;
  lunchMinutes: number | null;
};

const sumMinutes = ({ startMinute, endMinute, lunchMinutes }: MinuteSums) =>
  (endMinute ?? 0) - (startMinute ?? 0) - (lunchMinutes ?? 0);

export async function listReports(
  actor: SessionUser,
  params: ReportsListParams,
): Promise<{ rows: ReportListItem[]; rowCount: number; totals: ReportTotals }> {
  if (!canAny(actor, REPORTS_SECTION)) throw new PermissionDeniedError("reports.readOwn");

  const access = reportAccess(actor);
  const where = reportsWhere(actor, params);
  const [rows, totals] = await Promise.all([
    findReports(access, where, params.table, {
      skip: (params.table.page - 1) * params.table.pageSize,
      take: params.table.pageSize,
    }),
    reportTotals(where),
  ]);

  return { rows, rowCount: totals.count, totals };
}

export type ReportFilterOptions = {
  /** Null on a project's card, whose reports are all of one project. */
  projects: RecordOption[] | null;
  /** Null without reports.read, like the worker filter. */
  organizations: RecordOption[] | null;
  workers: RecordOption[] | null;
};

/**
 * What the filters offer: the projects, organisations and workers of the reports the user may see,
 * so that a filter never names another worker's project. `ourCompany` names the company's own
 * employees, whose reports have no organisation. With `projectId` — the "Отчёты" tab of a project
 * card — only the workers of the project, and neither the projects nor the organisations
 * (docs/ТЗ.md, 7.11).
 */
export async function listReportFilterOptions(
  actor: SessionUser,
  ourCompany: string,
  projectId?: string,
): Promise<ReportFilterOptions> {
  if (!canAny(actor, REPORTS_SECTION)) throw new PermissionDeniedError("reports.readOwn");

  const visible = { some: reportsWhere(actor, { projectId }) };
  const { all } = reportAccess(actor);
  const registry = projectId === undefined;
  const [projects, contractors, employeeReport, workers] = await Promise.all([
    registry
      ? db.project.findMany({
          where: { workReports: visible },
          select: { id: true, number: true, name: true },
          orderBy: [{ number: "desc" }, { id: "asc" }],
        })
      : null,
    all && registry
      ? db.contractor.findMany({
          where: { workReports: visible },
          select: { id: true, name: true, isActive: true },
          orderBy: [{ name: "asc" }, { id: "asc" }],
        })
      : null,
    all && registry
      ? db.workReport.findFirst({
          where: { AND: [reportsWhere(actor), { contractorId: null }] },
          select: { id: true },
        })
      : null,
    all
      ? db.user.findMany({
          where: { workReports: visible },
          select: { id: true, fullName: true, nickname: true },
          orderBy: [{ nickname: "asc" }, { id: "asc" }],
        })
      : null,
  ]);

  return {
    projects:
      projects &&
      projects.map(({ id, number, name }) => ({
        id,
        name: `${number} · ${name}`,
        isActive: true,
      })),
    // The company's own employees come after the contractors, as among a project's participants.
    organizations: contractors && [
      ...contractors,
      ...(employeeReport ? [{ id: OUR_COMPANY, name: ourCompany, isActive: true }] : []),
    ],
    workers:
      workers &&
      workers.map(({ id, fullName, nickname }) => ({
        id,
        // Chosen by the nickname, the name beside it (docs/ТЗ.md, 7.9); the search matches both.
        name: `${nickname} (${fullName})`,
        isActive: true,
      })),
  };
}

const cardSelect = {
  ...listSelect,
  createdAt: true,
  createdBy: personSelect,
  updatedBy: personSelect,
  approvedAt: true,
  approvedBy: personSelect,
} as const satisfies Prisma.WorkReportSelect;

export type ReportDetails = ReportFields & {
  /** Named on the card of every reader: the worker is the reader or one they manage. */
  worker: { id: string; fullName: string; nickname: string };
  /** Null for the company's own employee. */
  organization: { id: string; name: string; isActive: boolean } | null;
  stamps: {
    createdAt: Date;
    updatedAt: Date;
    createdBy: ReportPerson;
    updatedBy: ReportPerson;
  };
  approval: { at: Date; by: ReportPerson } | null;
};

/** The report its card shows (docs/ТЗ.md, 7.10); another worker's or a deleted one is null. */
export async function getReport(actor: SessionUser, id: string): Promise<ReportDetails | null> {
  if (!canAny(actor, REPORTS_SECTION)) throw new PermissionDeniedError("reports.readOwn");

  const access = reportAccess(actor);
  const row = await db.workReport.findFirst({
    where: { id, ...reportsWhere(actor) },
    select: cardSelect,
  });
  if (!row) return null;

  return {
    ...reportFields(row, access),
    worker: row.user,
    organization: row.contractor,
    stamps: {
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: person(row.createdBy, access),
      updatedBy: person(row.updatedBy, access),
    },
    approval:
      row.status === "APPROVED" && row.approvedAt
        ? { at: row.approvedAt, by: person(row.approvedBy, access) }
        : null,
  };
}

export type ProjectReportTotals = ReportTotals & {
  /**
   * The budget of hours against the approved hours. Absent without reports.read and
   * projects.budget.read, when the budget is not read at all; null when the project has none.
   */
  budget?: { hours: string; use: HoursBudgetUse } | null;
};

/**
 * The totals over the "Отчёты" tab of a project card (docs/ТЗ.md, 7.11; docs/ПРАВА-ДОСТУПА.md,
 * rule 20): of every report of the project with reports.read, of one's own otherwise, whatever the
 * table's filters. Only a reader of every report who may see the budget gets it compared.
 */
export async function getProjectReportTotals(
  actor: SessionUser,
  projectId: string,
): Promise<ProjectReportTotals> {
  if (!canAny(actor, REPORTS_SECTION)) throw new PermissionDeniedError("reports.readOwn");

  const compare = can(actor, "reports.read") && can(actor, "projects.budget.read");
  const [totals, project] = await Promise.all([
    reportTotals(reportsWhere(actor, { projectId })),
    compare
      ? db.project.findFirst({
          where: { id: projectId, deletedAt: null },
          select: { budgetHours: true },
        })
      : null,
  ]);
  if (!compare) return totals;

  const hours = project?.budgetHours?.toFixed(2) ?? null;
  return {
    ...totals,
    budget: hours === null ? null : { hours, use: hoursBudgetUse(totals.approvedMinutes, hours) },
  };
}

export type ParticipantTotals = {
  reports: number;
  approvedMinutes: number;
  minutes: number;
  mileageKm: number;
  lastWorkDate: Date;
};

export type ProjectParticipant = ParticipantTotals & {
  worker: { id: string; fullName: string; nickname: string };
};

export type ParticipantGroup = {
  /** Null for the company's own employees. */
  organization: { id: string; name: string; isActive: boolean } | null;
  participants: ProjectParticipant[];
  totals: ParticipantTotals;
};

const NO_REPORTS: ParticipantTotals = {
  reports: 0,
  approvedMinutes: 0,
  minutes: 0,
  mileageKm: 0,
  lastWorkDate: new Date(0),
};

function addTotals(sum: ParticipantTotals, add: ParticipantTotals): ParticipantTotals {
  return {
    reports: sum.reports + add.reports,
    approvedMinutes: sum.approvedMinutes + add.approvedMinutes,
    minutes: sum.minutes + add.minutes,
    mileageKm: sum.mileageKm + add.mileageKm,
    lastWorkDate: add.lastWorkDate > sum.lastWorkDate ? add.lastWorkDate : sum.lastWorkDate,
  };
}

const byName = (a: { name: string; id: string }, b: { name: string; id: string }) =>
  a.name.localeCompare(b.name, "ru") || (a.id < b.id ? -1 : 1);

/**
 * The "Участники" tab (docs/ТЗ.md, 7.11): the workers with a report on the project, grouped by the
 * organisation of the report rather than the one the account is linked to now — a worker who moved
 * to another contractor is listed under both. Contractors by name, then the company's own employees.
 */
export async function listProjectParticipants(
  actor: SessionUser,
  projectId: string,
): Promise<ParticipantGroup[]> {
  requirePermission(actor, "projects.participants");

  const rows = await db.workReport.groupBy({
    by: ["contractorId", "userId", "status"],
    where: reportsWhere(actor, { projectId }),
    _count: { _all: true },
    _sum: { startMinute: true, endMinute: true, lunchMinutes: true, mileageKm: true },
    _max: { workDate: true },
  });
  if (rows.length === 0) return [];

  const [users, contractors] = await Promise.all([
    db.user.findMany({
      where: { id: { in: [...new Set(rows.map((row) => row.userId))] } },
      select: { id: true, fullName: true, nickname: true },
    }),
    db.contractor.findMany({
      where: { id: { in: rows.flatMap((row) => (row.contractorId ? [row.contractorId] : [])) } },
      select: { id: true, name: true, isActive: true },
    }),
  ]);
  const workers = new Map(users.map((user) => [user.id, user]));

  // Keyed by organisation, then by worker; "" stands for the company's own employees.
  const groups = new Map<string, Map<string, ParticipantTotals>>();
  for (const { contractorId, userId, status, _count, _sum, _max } of rows) {
    const minutes = sumMinutes(_sum);
    const totals: ParticipantTotals = {
      reports: _count._all,
      approvedMinutes: status === "APPROVED" ? minutes : 0,
      minutes,
      mileageKm: _sum.mileageKm ?? 0,
      lastWorkDate: _max.workDate ?? new Date(0),
    };
    const byWorker = groups.get(contractorId ?? "") ?? new Map<string, ParticipantTotals>();
    byWorker.set(userId, addTotals(byWorker.get(userId) ?? NO_REPORTS, totals));
    groups.set(contractorId ?? "", byWorker);
  }

  const group = (
    organization: ParticipantGroup["organization"],
    byWorker: Map<string, ParticipantTotals>,
  ): ParticipantGroup => {
    const participants = [...byWorker].flatMap(([userId, totals]) => {
      const worker = workers.get(userId);
      return worker ? [{ ...totals, worker }] : [];
    });
    participants.sort((a, b) =>
      byName(
        { name: a.worker.fullName, id: a.worker.id },
        { name: b.worker.fullName, id: b.worker.id },
      ),
    );
    return {
      organization,
      participants,
      totals: participants.reduce(addTotals, NO_REPORTS),
    };
  };

  const employees = groups.get("");
  return [
    ...contractors.sort(byName).flatMap((contractor) => {
      const byWorker = groups.get(contractor.id);
      return byWorker ? [group(contractor, byWorker)] : [];
    }),
    ...(employees ? [group(null, employees)] : []),
  ];
}

export type ReportTableSettings = {
  hiddenColumns: ReportColumn[];
  columnSizes: Partial<Record<ReportColumn, number>>;
};

/**
 * The user's settings of the reports' tables (docs/ТЗ.md, 7.9): the hidden columns and the widths
 * they dragged columns to. Columns no longer known, and widths out of range, are dropped.
 */
export async function getReportTableSettings(actor: SessionUser): Promise<ReportTableSettings> {
  if (!canAny(actor, REPORTS_SECTION)) throw new PermissionDeniedError("reports.readOwn");

  const { hiddenColumns, columnSizes } = await readTableSettings(actor.id, "reports");
  return {
    hiddenColumns: REPORT_COLUMNS.filter((column) => hiddenColumns.includes(column)),
    columnSizes: Object.fromEntries(
      REPORT_COLUMNS.flatMap((column) => {
        const size = columnSizes[column];
        return size !== undefined && size >= MIN_COLUMN_WIDTH && size <= MAX_COLUMN_WIDTH
          ? [[column, size]]
          : [];
      }),
    ),
  };
}
