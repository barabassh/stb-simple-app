import type { SortOrder } from "@/components/data-table/search-params";
import type { ProjectStatus, VatRate } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
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
import type { ProjectsListParams } from "./list-params";

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
