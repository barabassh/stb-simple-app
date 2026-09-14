import type { SortOrder } from "@/components/data-table/search-params";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

import type { UserSortColumn, UsersListParams } from "./list-params";

/** Soft-deleted accounts stay in the table for the audit log and are excluded from every read. */
export const notDeleted = { deletedAt: null } as const satisfies Prisma.UserWhereInput;

const listItemSelect = {
  id: true,
  login: true,
  fullName: true,
  position: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const satisfies Prisma.UserSelect;

export type UserListItem = Prisma.UserGetPayload<{ select: typeof listItemSelect }>;

const ORDER_BY: Record<UserSortColumn, (order: SortOrder) => Prisma.UserOrderByWithRelationInput> =
  {
    login: (order) => ({ login: order }),
    fullName: (order) => ({ fullName: order }),
    position: (order) => ({ position: { sort: order, nulls: "last" } }),
    role: (order) => ({ role: order }),
    isActive: (order) => ({ isActive: order }),
    lastLoginAt: (order) => ({ lastLoginAt: { sort: order, nulls: "last" } }),
    createdAt: (order) => ({ createdAt: order }),
  };

export async function listUsers({
  query,
  roles,
  status,
  table,
}: UsersListParams): Promise<{ rows: UserListItem[]; rowCount: number }> {
  const where: Prisma.UserWhereInput = {
    ...notDeleted,
    ...(roles.length > 0 ? { role: { in: roles } } : {}),
    ...(status !== "all" ? { isActive: status === "active" } : {}),
    ...(query
      ? {
          OR: [
            { login: { contains: query, mode: "insensitive" } },
            { fullName: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, rowCount] = await Promise.all([
    db.user.findMany({
      where,
      select: listItemSelect,
      // The id tie-breaker keeps rows with equal sort values from moving between pages.
      orderBy: [
        ...(table.sort ? [ORDER_BY[table.sort.column](table.sort.order)] : []),
        { id: "asc" },
      ],
      skip: (table.page - 1) * table.pageSize,
      take: table.pageSize,
    }),
    db.user.count({ where }),
  ]);

  return { rows, rowCount };
}

export async function getUser(id: string) {
  return db.user.findFirst({
    where: { id, ...notDeleted },
    select: {
      id: true,
      login: true,
      fullName: true,
      position: true,
      email: true,
      phone: true,
      comment: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
}

export type UserDetails = NonNullable<Awaited<ReturnType<typeof getUser>>>;

export async function listActiveUserSessions(userId: string) {
  return db.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() }, user: notDeleted },
    select: { id: true, createdAt: true, lastActiveAt: true, ip: true, userAgent: true },
    orderBy: { lastActiveAt: "desc" },
  });
}

export type UserSessionItem = Awaited<ReturnType<typeof listActiveUserSessions>>[number];
