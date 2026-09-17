import type { TableState } from "@/components/data-table/search-params";
import type { Prisma } from "@/generated/prisma/client";
import { readAuditChanges, type AuditEntity } from "@/lib/audit";
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

export type AuditLogItem = ReturnType<typeof toListItem>;

/** The history of a record is read on its card, with the right to that card's history. */
const HISTORY_PERMISSION: Record<AuditEntity, Permission> = {
  User: "users.history.read",
  Session: "audit.read",
  AuditLog: "audit.read",
  CompanyProfile: "settings.company.history",
};

function toListItem(
  { actor, changes, ip, userAgent, ...entry }: AuditLogRecord,
  withRequestInfo: boolean,
) {
  return {
    ...entry,
    actorName: actor?.fullName ?? null,
    changes: readAuditChanges(changes),
    ip: withRequestInfo ? ip : null,
    userAgent: withRequestInfo ? userAgent : null,
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
  withRequestInfo: boolean,
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

  return { rows: records.map((record) => toListItem(record, withRequestInfo)), rowCount };
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

  return findAuditLogs(auditLogsWhere(params), params.table, true);
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
  return records.map((record) => toListItem(record, true));
}

/**
 * The history of one record, shown on its card. IP addresses and browsers are left out unless
 * the reader may open the journal: a manager reads a user's history but not other people's
 * sessions (docs/ПРАВА-ДОСТУПА.md, 3.7).
 */
export async function listEntityAuditLogs(
  actor: SessionUser,
  entity: AuditEntity,
  entityId: string,
  table: TableState<AuditSortColumn>,
) {
  requirePermission(actor, HISTORY_PERMISSION[entity]);

  return findAuditLogs({ entity, entityId }, table, can(actor, "audit.read"));
}
