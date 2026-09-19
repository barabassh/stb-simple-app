import type { SortOrder } from "@/components/data-table/search-params";
import type { RecordOption } from "@/components/reference-book/record-picker";
import type { Prisma } from "@/generated/prisma/client";
import type { WorkReportStatus } from "@/generated/prisma/enums";
import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  canAny,
  PermissionDeniedError,
  REPORTS_SECTION,
  requirePermission,
} from "@/lib/permissions";

import {
  DEFAULT_REPORT_SORT,
  reportAccess,
  reportSortColumns,
  type ReportAccess,
  type ReportSortColumn,
} from "./columns";
import { OUR_COMPANY, type ReportFilters, type ReportsListParams } from "./list-params";
import { workedMinutes } from "./time";

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
  /** Absent without reports.read; null for the company's own employee. */
  organization?: { id: string; name: string; isActive: boolean } | null;
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

type ReportFields = Omit<ReportListItem, "worker" | "organization" | "updatedAt">;

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
  return { ...fields, worker: row.user, organization: row.contractor, updatedAt: row.updatedAt };
}

// Within one value the newest day comes first and a day reads by the start of work; the id keeps
// rows with equal values from moving between pages.
const WITHIN: Prisma.WorkReportOrderByWithRelationInput[] = [
  { workDate: "desc" },
  { startMinute: "asc" },
  { id: "asc" },
];

const ORDER_BY: Record<
  Exclude<ReportSortColumn, "hours">,
  (order: SortOrder) => Prisma.WorkReportOrderByWithRelationInput[]
> = {
  workDate: (order) => [{ workDate: order }, { startMinute: "asc" }, { id: "asc" }],
  worker: (order) => [{ user: { fullName: order } }, ...WITHIN],
  project: (order) => [{ project: { number: order } }, ...WITHIN],
  mileageKm: (order) => [{ mileageKm: order }, ...WITHIN],
  status: (order) => [{ status: order }, ...WITHIN],
};

type Page = { skip: number; take: number };

/**
 * The hours are not stored (docs/СХЕМА-БД.md, 10.4) and Prisma does not order by an expression:
 * the matching reports are ordered by their minutes here, and only the page is read in full.
 */
async function findIdsByHours(
  where: Prisma.WorkReportWhereInput,
  order: SortOrder,
  page?: Page,
): Promise<string[]> {
  const rows = await db.workReport.findMany({
    where,
    select: { id: true, workDate: true, startMinute: true, endMinute: true, lunchMinutes: true },
  });
  const sign = order === "asc" ? 1 : -1;
  rows.sort(
    (a, b) =>
      sign * (workedMinutes(a) - workedMinutes(b)) ||
      b.workDate.getTime() - a.workDate.getTime() ||
      a.startMinute - b.startMinute ||
      (a.id < b.id ? -1 : 1),
  );
  const ids = rows.map((row) => row.id);
  return page ? ids.slice(page.skip, page.skip + page.take) : ids;
}

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

  if (column === "hours") {
    const ids = await findIdsByHours(where, order, page);
    const rows = await db.workReport.findMany({ where: { id: { in: ids } }, select: listSelect });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [toListItem(row, access)] : [];
    });
  }

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
  /** The minutes of the approved reports among them. */
  approvedMinutes: number;
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

  const totals: ReportTotals = { count: 0, minutes: 0, mileageKm: 0, approvedMinutes: 0 };
  for (const { status, _count, _sum } of groups) {
    const minutes = (_sum.endMinute ?? 0) - (_sum.startMinute ?? 0) - (_sum.lunchMinutes ?? 0);
    totals.count += _count._all;
    totals.minutes += minutes;
    totals.mileageKm += _sum.mileageKm ?? 0;
    if (status === "APPROVED") totals.approvedMinutes += minutes;
  }
  return totals;
}

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
  projects: RecordOption[];
  /** Null without reports.read, like the worker filter. */
  organizations: RecordOption[] | null;
  workers: RecordOption[] | null;
};

/**
 * What the filters offer: the projects, organisations and workers of the reports the user may see,
 * so that a filter never names another worker's project. `ourCompany` names the company's own
 * employees, whose reports have no organisation.
 */
export async function listReportFilterOptions(
  actor: SessionUser,
  ourCompany: string,
): Promise<ReportFilterOptions> {
  if (!canAny(actor, REPORTS_SECTION)) throw new PermissionDeniedError("reports.readOwn");

  const visible = { some: reportsWhere(actor) };
  const { all } = reportAccess(actor);
  const [projects, contractors, employeeReport, workers] = await Promise.all([
    db.project.findMany({
      where: { workReports: visible },
      select: { id: true, number: true, name: true },
      orderBy: [{ number: "desc" }, { id: "asc" }],
    }),
    all
      ? db.contractor.findMany({
          where: { workReports: visible },
          select: { id: true, name: true, isActive: true },
          orderBy: [{ name: "asc" }, { id: "asc" }],
        })
      : null,
    all
      ? db.workReport.findFirst({
          where: { AND: [reportsWhere(actor), { contractorId: null }] },
          select: { id: true },
        })
      : null,
    all
      ? db.user.findMany({
          where: { workReports: visible },
          select: { id: true, fullName: true, nickname: true },
          orderBy: [{ fullName: "asc" }, { id: "asc" }],
        })
      : null,
  ]);

  return {
    projects: projects.map(({ id, number, name }) => ({
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
        name: `${fullName} (${nickname})`,
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
