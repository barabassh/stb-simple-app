import type { TableState } from "@/components/data-table/search-params";
import type { Prisma } from "@/generated/prisma/client";
import { readAuditChanges, type AuditChange, type AuditEntity } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { displayDayRange } from "@/lib/format";
import { can, requirePermission, type Permission } from "@/lib/permissions";

import type { AuditListParams, AuditSortColumn } from "./list-params";
import { auditFieldRules } from "./fields";
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

/** A change whose values the reader may not see: only the fact of the change is shown. */
export type AuditChangeItem = AuditChange & { withheld?: true };

/**
 * Hides the values of the fields marked with a right the reader lacks (./fields.ts). The fields
 * are written to the log like any other, and the reading hides them, so that the rule holds for
 * entries written before the right was taken away.
 */
function visibleChanges(entity: string, value: unknown, reader: SessionUser): AuditChangeItem[] {
  const rules = auditFieldRules(entity);
  const shown: AuditChangeItem[] = [];
  const withheld = new Set<string>();

  for (const change of readAuditChanges(value)) {
    const rule = rules[change.field];
    if (rule?.readPermission && !can(reader, rule.readPermission)) withheld.add(rule.withheldAs);
    else shown.push(change);
  }

  return [
    ...shown,
    ...[...withheld].map((field) => ({
      field,
      before: null,
      after: null,
      withheld: true as const,
    })),
  ];
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
  reader: SessionUser,
) {
  const requestInfo = can(reader, "audit.read");
  return {
    ...entry,
    actorName: actor?.fullName ?? null,
    changes: visibleChanges(entry.entity, changes, reader),
    ip: requestInfo ? ip : null,
    userAgent: requestInfo ? userAgent : null,
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
  reader: SessionUser,
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

  return { rows: records.map((record) => toListItem(record, reader)), rowCount };
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

  return findAuditLogs(auditLogsWhere(params), params.table, actor);
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
  return records.map((record) => toListItem(record, actor));
}

/**
 * The history of one record, shown on its card. IP addresses and browsers are left out unless
 * the reader may open the journal: a manager reads a user's history but not other people's
 * sessions (docs/ПРАВА-ДОСТУПА.md, 3.7). Fields with a right of their own are withheld the same way.
 */
export async function listEntityAuditLogs(
  actor: SessionUser,
  entity: AuditEntity,
  entityId: string,
  table: TableState<AuditSortColumn>,
) {
  requirePermission(actor, HISTORY_PERMISSION[entity]);

  return findAuditLogs({ entity, entityId }, table, actor);
}
