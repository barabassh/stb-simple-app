import {
  parseTableState,
  readParam,
  type SearchParamsInput,
  type TableState,
} from "@/components/data-table/search-params";
import { AuditAction } from "@/generated/prisma/enums";
import { AUDIT_ENTITIES, type AuditEntity } from "@/lib/audit";
import { displayDayRange } from "@/lib/format";

// Read by the journal page and written by its filter bar.

export const AUDIT_SEARCH_PARAMS = {
  actor: "actor",
  actions: "action",
  entity: "entity",
  from: "from",
  to: "to",
} as const;

export const AUDIT_ACTIONS = Object.values(AuditAction);

export const AUDIT_SORT_COLUMNS = ["at"] as const;
export type AuditSortColumn = (typeof AUDIT_SORT_COLUMNS)[number];

export type AuditListParams = {
  /** Part of the author's login or full name. */
  actor: string;
  actions: AuditAction[];
  entity: AuditEntity | null;
  /** Calendar days in Europe/Kyiv as `yyyy-MM-dd`, both included; empty when not set. */
  from: string;
  to: string;
  table: TableState<AuditSortColumn>;
};

/** The newest entries first, both in the journal and in a record's history. */
export function parseAuditTableState(searchParams: SearchParamsInput) {
  return parseTableState(searchParams, {
    sortableColumns: AUDIT_SORT_COLUMNS,
    defaultSort: { column: "at", order: "desc" },
  });
}

function readDay(searchParams: SearchParamsInput, key: string): string {
  const value = readParam(searchParams, key)?.trim() ?? "";
  return displayDayRange(value) ? value : "";
}

export function parseAuditListParams(searchParams: SearchParamsInput): AuditListParams {
  const actions = new Set(readParam(searchParams, AUDIT_SEARCH_PARAMS.actions)?.split(","));
  const entity = readParam(searchParams, AUDIT_SEARCH_PARAMS.entity);

  return {
    actor: readParam(searchParams, AUDIT_SEARCH_PARAMS.actor)?.trim() ?? "",
    actions: AUDIT_ACTIONS.filter((action) => actions.has(action)),
    entity: AUDIT_ENTITIES.find((value) => value === entity) ?? null,
    from: readDay(searchParams, AUDIT_SEARCH_PARAMS.from),
    to: readDay(searchParams, AUDIT_SEARCH_PARAMS.to),
    table: parseAuditTableState(searchParams),
  };
}

export function hasAuditFilters({ actor, actions, entity, from, to }: AuditListParams): boolean {
  return actor !== "" || actions.length > 0 || entity !== null || from !== "" || to !== "";
}
