import {
  parseTableState,
  readParam,
  type SearchParamsInput,
  type TableState,
} from "@/components/data-table/search-params";
import { Role } from "@/generated/prisma/enums";

// Read by the registry page and written by its filter bar; the export will take the same
// parameters so that it returns exactly the rows on screen.

export const USERS_SEARCH_PARAMS = {
  query: "q",
  roles: "role",
  status: "status",
} as const;

export const USER_ROLES = Object.values(Role);

export const USER_STATUS_FILTERS = ["all", "active", "blocked"] as const;
export type UserStatusFilter = (typeof USER_STATUS_FILTERS)[number];

export const USER_SORT_COLUMNS = [
  "login",
  "fullName",
  "position",
  "role",
  "isActive",
  "lastLoginAt",
  "createdAt",
] as const;
export type UserSortColumn = (typeof USER_SORT_COLUMNS)[number];

export type UsersListParams = {
  query: string;
  roles: Role[];
  status: UserStatusFilter;
  table: TableState<UserSortColumn>;
};

export function parseUsersListParams(searchParams: SearchParamsInput): UsersListParams {
  const roles = new Set(readParam(searchParams, USERS_SEARCH_PARAMS.roles)?.split(","));
  const status = readParam(searchParams, USERS_SEARCH_PARAMS.status);

  return {
    query: readParam(searchParams, USERS_SEARCH_PARAMS.query)?.trim() ?? "",
    roles: USER_ROLES.filter((role) => roles.has(role)),
    status: USER_STATUS_FILTERS.find((value) => value === status) ?? "all",
    table: parseTableState(searchParams, {
      sortableColumns: USER_SORT_COLUMNS,
      defaultSort: { column: "fullName", order: "asc" },
    }),
  };
}

export function hasUserFilters({ query, roles, status }: UsersListParams): boolean {
  return query !== "" || roles.length > 0 || status !== "all";
}
