import type { SortOrder } from "@/components/data-table/search-params";
import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

import type { UserSortColumn, UsersListParams } from "./list-params";

// Pages check the permission themselves to show the access denied page; the checks here keep
// a page that forgets it from showing the data anyway.

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

function usersWhere({ query, roles, status }: UsersListParams): Prisma.UserWhereInput {
  return {
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
}

function usersOrderBy({ sort }: UsersListParams["table"]): Prisma.UserOrderByWithRelationInput[] {
  // The id tie-breaker keeps rows with equal sort values from moving between pages.
  return [...(sort ? [ORDER_BY[sort.column](sort.order)] : []), { id: "asc" }];
}

export async function listUsers(
  actor: SessionUser,
  params: UsersListParams,
): Promise<{ rows: UserListItem[]; rowCount: number }> {
  requirePermission(actor, "users.read");

  const where = usersWhere(params);
  const [rows, rowCount] = await Promise.all([
    db.user.findMany({
      where,
      select: listItemSelect,
      orderBy: usersOrderBy(params.table),
      skip: (params.table.page - 1) * params.table.pageSize,
      take: params.table.pageSize,
    }),
    db.user.count({ where }),
  ]);

  return { rows, rowCount };
}

/** Every user the registry shows with these parameters, in its order, on all of its pages. */
export async function listUsersForExport(
  actor: SessionUser,
  params: UsersListParams,
): Promise<UserListItem[]> {
  requirePermission(actor, "users.export");

  return db.user.findMany({
    where: usersWhere(params),
    select: listItemSelect,
    orderBy: usersOrderBy(params.table),
  });
}

export async function getUser(actor: SessionUser, id: string) {
  requirePermission(actor, "users.read");

  return db.user.findUnique({
    where: { id },
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
      updatedAt: true,
      createdBy: { select: { fullName: true, login: true } },
      updatedBy: { select: { fullName: true, login: true } },
    },
  });
}

export type UserDetails = NonNullable<Awaited<ReturnType<typeof getUser>>>;

function findActiveSessions(userId: string) {
  return db.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, createdAt: true, lastActiveAt: true, ip: true, userAgent: true },
    orderBy: { lastActiveAt: "desc" },
  });
}

export type UserSessionItem = Awaited<ReturnType<typeof findActiveSessions>>[number];

export async function listActiveUserSessions(actor: SessionUser, userId: string) {
  requirePermission(actor, "users.sessions.read");
  return findActiveSessions(userId);
}

/** The comment is left out: it is the administrator's note about the user, not their own data. */
export async function getOwnProfile(actor: SessionUser) {
  requirePermission(actor, "profile.read");

  return db.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: {
      login: true,
      fullName: true,
      position: true,
      email: true,
      phone: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      createdBy: { select: { fullName: true, login: true } },
      updatedBy: { select: { fullName: true, login: true } },
    },
  });
}

export type OwnProfile = Awaited<ReturnType<typeof getOwnProfile>>;

export async function listOwnSessions(actor: SessionUser) {
  requirePermission(actor, "profile.sessions");
  return findActiveSessions(actor.id);
}
