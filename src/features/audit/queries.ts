import type { TableState } from "@/components/data-table/search-params";
import type { Prisma } from "@/generated/prisma/client";
import { readAuditChanges, type AuditChange, type AuditEntity } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { displayDayRange } from "@/lib/format";
import { can, requirePermission, type Permission } from "@/lib/permissions";

import type { AuditListParams, AuditSortColumn } from "./list-params";
import { auditExportPeriodSchema } from "./schemas";

// Only reads: the log has no path in the application that changes or deletes an entry.

const listItemSelect = {
  id: true,
  at: true,
  actorLogin: true,
  action: true,
  entity: true,
  entityId: true,
  summary: true,
  changes: true,
  ip: true,
  userAgent: true,
  actor: { select: { fullName: true } },
} as const satisfies Prisma.AuditLogSelect;

type AuditLogRecord = Prisma.AuditLogGetPayload<{ select: typeof listItemSelect }>;

/**
 * Fields of a project that only a reader with projects.budget.read sees the values of
 * (docs/СХЕМА-БД.md, 9.4). They are written to the log like any other field, and the reading
 * replaces them, so that the rule holds for entries written before the right was taken away.
 */
export const PROJECT_BUDGET_FIELDS = ["budgetAmount", "vatRate", "budgetHours"] as const;

const projectBudgetFields: ReadonlySet<string> = new Set(PROJECT_BUDGET_FIELDS);

/** The field that stands in for the withheld budget fields: "Бюджет: изменён". */
export const WITHHELD_BUDGET_FIELD = "budget";

/** A change whose values the reader may not see: only the fact of the change is shown. */
export type AuditChangeItem = AuditChange & { withheld?: true };

type ReaderRights = { requestInfo: boolean; budget: boolean };

function readerRights(actor: SessionUser): ReaderRights {
  return { requestInfo: can(actor, "audit.read"), budget: can(actor, "projects.budget.read") };
}

function visibleChanges(entity: string, value: unknown, budget: boolean): AuditChangeItem[] {
  const changes = readAuditChanges(value);
  if (budget || entity !== "Project") return changes;

  const shown = changes.filter(({ field }) => !projectBudgetFields.has(field));
  return shown.length === changes.length
    ? shown
    : [...shown, { field: WITHHELD_BUDGET_FIELD, before: null, after: null, withheld: true }];
}

export type AuditLogItem = ReturnType<typeof toListItem>;

/** The history of a record is read on its card, with the right to that card's history. */
const HISTORY_PERMISSION: Record<AuditEntity, Permission> = {
  User: "users.history.read",
  Session: "audit.read",
  AuditLog: "audit.read",
  CompanyProfile: "settings.company.history",
  Customer: "customers.history",
  Contractor: "contractors.history",
  Project: "projects.history",
  WorkReport: "reports.history",
};

function toListItem(
  { actor, changes, ip, userAgent, ...entry }: AuditLogRecord,
  rights: ReaderRights,
) {
  return {
    ...entry,
    actorName: actor?.fullName ?? null,
    changes: visibleChanges(entry.entity, changes, rights.budget),
    ip: rights.requestInfo ? ip : null,
    userAgent: rights.requestInfo ? userAgent : null,
  };
}

function auditLogsOrderBy(
  table: TableState<AuditSortColumn>,
): Prisma.AuditLogOrderByWithRelationInput[] {
  const order = table.sort?.order ?? "desc";
  // Entries of one transaction share the same time; the id keeps their order and paging stable.
  return [{ at: order }, { id: order }];
}

async function findAuditLogs(
  where: Prisma.AuditLogWhereInput,
  table: TableState<AuditSortColumn>,
  rights: ReaderRights,
): Promise<{ rows: AuditLogItem[]; rowCount: number }> {
  const [records, rowCount] = await Promise.all([
    db.auditLog.findMany({
      where,
      select: listItemSelect,
      orderBy: auditLogsOrderBy(table),
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.auditLog.count({ where }),
  ]);

  return { rows: records.map((record) => toListItem(record, rights)), rowCount };
}

function auditLogsWhere({
  actor: author,
  actions,
  entity,
  from,
  to,
}: AuditListParams): Prisma.AuditLogWhereInput {
  const fromDay = displayDayRange(from);
  const toDay = displayDayRange(to);

  return {
    ...(author
      ? {
          OR: [
            { actorLogin: { contains: author, mode: "insensitive" } },
            { actor: { fullName: { contains: author, mode: "insensitive" } } },
          ],
        }
      : {}),
    ...(actions.length > 0 ? { action: { in: actions } } : {}),
    ...(entity ? { entity } : {}),
    ...(fromDay || toDay
      ? {
          at: {
            ...(fromDay ? { gte: fromDay.start } : {}),
            ...(toDay ? { lt: toDay.end } : {}),
          },
        }
      : {}),
  };
}

export async function listAuditLogs(actor: SessionUser, params: AuditListParams) {
  requirePermission(actor, "audit.read");

  return findAuditLogs(auditLogsWhere(params), params.table, readerRights(actor));
}

/** Every entry the journal shows with these parameters, in its order, on all of its pages. */
export async function listAuditLogsForExport(
  actor: SessionUser,
  params: AuditListParams,
): Promise<AuditLogItem[]> {
  requirePermission(actor, "audit.export");
  // The buttons, the route and the print view refuse a longer period with a message; this keeps
  // a caller that forgets to check from reading the whole journal.
  if (!auditExportPeriodSchema.safeParse(params).success) {
    throw new Error("The journal is exported for a period of at most one month");
  }

  const records = await db.auditLog.findMany({
    where: auditLogsWhere(params),
    select: listItemSelect,
    orderBy: auditLogsOrderBy(params.table),
  });
  const rights = readerRights(actor);
  return records.map((record) => toListItem(record, rights));
}

/**
 * The history of one record, shown on its card. IP addresses and browsers are left out unless
 * the reader may open the journal: a manager reads a user's history but not other people's
 * sessions (docs/ПРАВА-ДОСТУПА.md, 3.7). The budget of a project is withheld the same way.
 */
export async function listEntityAuditLogs(
  actor: SessionUser,
  entity: AuditEntity,
  entityId: string,
  table: TableState<AuditSortColumn>,
) {
  requirePermission(actor, HISTORY_PERMISSION[entity]);

  return findAuditLogs({ entity, entityId }, table, readerRights(actor));
}
