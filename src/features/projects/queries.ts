import type { SortOrder } from "@/components/data-table/search-params";
import type { ProjectStatus, VatRate } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { displayTodayIso } from "@/lib/format";
import { requirePermission } from "@/lib/permissions";

import { budgetWithVat } from "./budget";
import {
  DEFAULT_PROJECT_SORT,
  projectAccess,
  projectSortColumns,
  type ProjectAccess,
  type ProjectSortColumn,
} from "./columns";
import { projectDuration } from "./duration";
import type { ProjectFormRecord } from "./form-values";
import type { ProjectsListParams } from "./list-params";
import { nextProjectNumber } from "./number";

// The select is built from the permissions of the reader (docs/АРХИТЕКТУРА.md, 3.9): fields a role
// may not see are never read from the database, rather than being hidden by a component.

const contractorSelect = {
  id: true,
  number: true,
  name: true,
  street: true,
  houseNumber: true,
  houseNumberAddition: true,
  postcode: true,
  city: true,
  country: true,
  startDate: true,
} as const satisfies Prisma.ProjectSelect;

const fullSelect = {
  status: true,
  closedAt: true,
  updatedAt: true,
  customer: { select: { id: true, name: true, isActive: true } },
} as const satisfies Prisma.ProjectSelect;

const budgetSelect = {
  budgetAmount: true,
  vatRate: true,
  budgetHours: true,
} as const satisfies Prisma.ProjectSelect;

type ProjectRow = Prisma.ProjectGetPayload<{ select: typeof contractorSelect }> &
  Partial<Prisma.ProjectGetPayload<{ select: typeof fullSelect & typeof budgetSelect }>>;

function listSelect(access: ProjectAccess): Prisma.ProjectSelect {
  return {
    ...contractorSelect,
    ...(access.all ? fullSelect : {}),
    ...(access.budget ? budgetSelect : {}),
  };
}

export type ProjectAddress = Pick<
  ProjectRow,
  "street" | "houseNumber" | "houseNumberAddition" | "postcode" | "city" | "country"
>;

/** Exact decimal strings, as the database stores them; the total with VAT is calculated. */
export type ProjectBudget = {
  amount: string | null;
  vatRate: VatRate | null;
  amountWithVat: string | null;
  hours: string | null;
};

export type ProjectListItem = {
  id: string;
  number: string;
  name: string;
  address: ProjectAddress;
  startDate: Date;
  /** Days up to today or the closing date; null while the project has not started. */
  duration: number | null;
  /** Absent for a reader without projects.read, such as a contractor. */
  customer?: { id: string; name: string; isActive: boolean };
  status?: ProjectStatus;
  updatedAt?: Date;
  /** Absent without projects.budget.read: the fields were not read at all. */
  budget?: ProjectBudget;
};

function toListItem(row: ProjectRow, access: ProjectAccess, now: Date): ProjectListItem {
  const { id, number, name, startDate, closedAt, customer, status, updatedAt } = row;
  const { street, houseNumber, houseNumberAddition, postcode, city, country } = row;
  const amount = row.budgetAmount?.toFixed(2) ?? null;
  const vatRate = row.vatRate ?? null;

  return {
    id,
    number,
    name,
    address: { street, houseNumber, houseNumberAddition, postcode, city, country },
    startDate,
    duration: projectDuration({ startDate, closedAt }, now),
    ...(access.all ? { customer, status, updatedAt } : {}),
    ...(access.budget
      ? {
          budget: {
            amount,
            vatRate,
            amountWithVat:
              amount !== null && vatRate !== null ? budgetWithVat(amount, vatRate) : null,
            hours: row.budgetHours?.toFixed(2) ?? null,
          },
        }
      : {}),
  };
}

const ORDER_BY: Record<
  ProjectSortColumn,
  (order: SortOrder) => Prisma.ProjectOrderByWithRelationInput
> = {
  number: (order) => ({ number: order }),
  name: (order) => ({ name: order }),
  customer: (order) => ({ customer: { name: order } }),
  startDate: (order) => ({ startDate: order }),
  status: (order) => ({ status: order }),
  budgetAmount: (order) => ({ budgetAmount: { sort: order, nulls: "last" } }),
  budgetHours: (order) => ({ budgetHours: { sort: order, nulls: "last" } }),
  updatedAt: (order) => ({ updatedAt: order }),
};

const STATUS_WHERE = {
  inProgress: "IN_PROGRESS",
  closed: "CLOSED",
  all: undefined,
} as const satisfies Record<ProjectsListParams["status"], ProjectStatus | undefined>;

function projectsWhere(
  params: ProjectsListParams,
  access: ProjectAccess,
): Prisma.ProjectWhereInput {
  // Without projects.read only projects in progress exist, whatever the parameters say, and
  // the customer is neither a filter nor searched: a match would give its name away.
  const status = access.all ? STATUS_WHERE[params.status] : "IN_PROGRESS";
  const contains = { contains: params.query, mode: "insensitive" } as const;

  return {
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(access.all && params.customerId ? { customerId: params.customerId } : {}),
    ...(params.query
      ? {
          OR: [
            { number: contains },
            { name: contains },
            { city: contains },
            ...(access.all ? [{ customer: { name: contains } }] : []),
          ],
        }
      : {}),
  };
}

function projectsOrderBy(
  { sort }: ProjectsListParams["table"],
  access: ProjectAccess,
): Prisma.ProjectOrderByWithRelationInput[] {
  const { column, order } =
    sort && projectSortColumns(access).includes(sort.column) ? sort : DEFAULT_PROJECT_SORT;
  // The id tie-breaker keeps rows with equal sort values from moving between pages.
  return [ORDER_BY[column](order), { id: "asc" }];
}

async function findProjects(
  access: ProjectAccess,
  params: ProjectsListParams,
  page?: { skip: number; take: number },
): Promise<ProjectListItem[]> {
  // The select is narrowed to the access at run time; ProjectRow marks the rest optional.
  const rows = (await db.project.findMany({
    where: projectsWhere(params, access),
    select: listSelect(access),
    orderBy: projectsOrderBy(params.table, access),
    ...page,
  })) as unknown as ProjectRow[];

  const now = new Date();
  return rows.map((row) => toListItem(row, access, now));
}

export async function listProjects(
  actor: SessionUser,
  params: ProjectsListParams,
): Promise<{ rows: ProjectListItem[]; rowCount: number }> {
  requirePermission(actor, "projects.readActive");

  const access = projectAccess(actor);
  const [rows, rowCount] = await Promise.all([
    findProjects(access, params, {
      skip: (params.table.page - 1) * params.table.pageSize,
      take: params.table.pageSize,
    }),
    db.project.count({ where: projectsWhere(params, access) }),
  ]);

  return { rows, rowCount };
}

/** Every project the registry shows with these parameters, in its order, on all of its pages. */
export async function listProjectsForExport(
  actor: SessionUser,
  params: ProjectsListParams,
): Promise<ProjectListItem[]> {
  requirePermission(actor, "projects.export");

  return findProjects(projectAccess(actor), params);
}

/**
 * The number the create form offers (docs/ТЗ.md, 6.6): the next one of the current year in
 * Europe/Kyiv. Deleted projects count too, so that a number once used is not offered again; the
 * number is not reserved, and a taken one is reported by the unique index when saving.
 */
export async function suggestProjectNumber(actor: SessionUser): Promise<string> {
  requirePermission(actor, "projects.create");

  const year = Number(displayTodayIso().slice(0, 4));
  const projects = await db.project.findMany({
    where: { number: { startsWith: `${year}-` } },
    select: { number: true },
  });

  return nextProjectNumber(
    projects.map((project) => project.number),
    year,
  );
}

export type ProjectForEdit = ProjectFormRecord & {
  id: string;
  status: ProjectStatus;
  customer: { id: string; name: string; isActive: boolean };
};

/** A project that is not deleted, as the edit form opens it; null for anything else. */
export async function getProjectForEdit(
  actor: SessionUser,
  id: string,
): Promise<ProjectForEdit | null> {
  requirePermission(actor, "projects.update");

  const project = await db.project.findFirst({
    where: { id, deletedAt: null },
    select: projectFormSelect,
  });
  return project && toFormRecord(project);
}

export const projectFormSelect = {
  id: true,
  status: true,
  number: true,
  name: true,
  customerId: true,
  customer: { select: { id: true, name: true, isActive: true } },
  street: true,
  houseNumber: true,
  houseNumberAddition: true,
  postcode: true,
  city: true,
  country: true,
  startDate: true,
  description: true,
  budgetAmount: true,
  vatRate: true,
  budgetHours: true,
} as const satisfies Prisma.ProjectSelect;

/** Decimals are handed on as exact strings: a client component cannot receive a Decimal. */
export function toFormRecord(
  project: Prisma.ProjectGetPayload<{ select: typeof projectFormSelect }>,
): ProjectForEdit {
  return {
    ...project,
    budgetAmount: project.budgetAmount?.toFixed(2) ?? null,
    budgetHours: project.budgetHours?.toFixed(2) ?? null,
  };
}
