import type { SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";

// What a role sees of the projects (docs/ТЗ.md, 6.8; docs/ПРАВА-ДОСТУПА.md, rules 11–12). The
// query, the registry and the export all take their fields from here, so the screen cannot show
// a column the query did not read, and the file cannot hold one the screen does not show.

export type ProjectAccess = {
  /** projects.read: every status, the customer and the stamps; without it only projects in progress. */
  all: boolean;
  /** projects.budget.read: the budget fields are read from the database at all. */
  budget: boolean;
};

export function projectAccess(user: Pick<SessionUser, "role">): ProjectAccess {
  return { all: can(user, "projects.read"), budget: can(user, "projects.budget.read") };
}

/** In the order of the registry; the export adds the VAT rate and the total after the budget. */
export const PROJECT_COLUMNS = [
  "number",
  "name",
  "customer",
  "address",
  "startDate",
  "duration",
  "status",
  "budgetAmount",
  "vatRate",
  "budgetWithVat",
  "budgetHours",
  "updatedAt",
] as const;
export type ProjectColumn = (typeof PROJECT_COLUMNS)[number];

const NEEDS: Partial<Record<ProjectColumn, keyof ProjectAccess>> = {
  customer: "all",
  status: "all",
  updatedAt: "all",
  budgetAmount: "budget",
  vatRate: "budget",
  budgetWithVat: "budget",
  budgetHours: "budget",
};

const EXPORT_ONLY: readonly ProjectColumn[] = ["vatRate", "budgetWithVat"];

const UNSORTABLE = ["address", "duration", "vatRate", "budgetWithVat"] as const;
export type ProjectSortColumn = Exclude<ProjectColumn, (typeof UNSORTABLE)[number]>;

export const DEFAULT_PROJECT_SORT = { column: "startDate", order: "desc" } as const satisfies {
  column: ProjectSortColumn;
  order: "asc" | "desc";
};

export function projectColumns(access: ProjectAccess, target: "table" | "export"): ProjectColumn[] {
  return PROJECT_COLUMNS.filter((column) => {
    const needed = NEEDS[column];
    if (needed && !access[needed]) return false;
    return target === "export" || !EXPORT_ONLY.includes(column);
  });
}

function isSortable(column: ProjectColumn): column is ProjectSortColumn {
  return !(UNSORTABLE as readonly ProjectColumn[]).includes(column);
}

/** Sorting by a column the role does not see would give its values away through the order. */
export function projectSortColumns(access: ProjectAccess): ProjectSortColumn[] {
  return projectColumns(access, "table").filter(isSortable);
}
