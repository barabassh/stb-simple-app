import type { TableState } from "@/components/data-table/search-params";
import type { Prisma } from "@/generated/prisma/client";
import { readAuditChanges, type AuditEntity } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { displayDayRange } from "@/lib/format";
import { can, requirePermission, type Permission } from "@/lib/permissions";

import type { AuditListParams, AuditSortColumn } from "./list-params";

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

async function findAuditLogs(
  where: Prisma.AuditLogWhereInput,
  table: TableState<AuditSortColumn>,
  withRequestInfo: boolean,
): Promise<{ rows: AuditLogItem[]; rowCount: number }> {
  const order = table.sort?.order ?? "desc";

  const [records, rowCount] = await Promise.all([
    db.auditLog.findMany({
      where,
      select: listItemSelect,
      // Entries of one transaction share the same time; the id keeps their order and paging stable.
      orderBy: [{ at: order }, { id: order }],
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.auditLog.count({ where }),
  ]);

  return { rows: records.map((record) => toListItem(record, withRequestInfo)), rowCount };
}

export async function listAuditLogs(
  actor: SessionUser,
  { actor: author, actions, entity, from, to, table }: AuditListParams,
) {
  requirePermission(actor, "audit.read");

  const fromDay = displayDayRange(from);
  const toDay = displayDayRange(to);

  const where: Prisma.AuditLogWhereInput = {
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

  return findAuditLogs(where, table, true);
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
