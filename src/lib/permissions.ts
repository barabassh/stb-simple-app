import type { Role } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/auth/session";

// Permission codes from docs/ПРАВА-ДОСТУПА.md, section 2.
export type Permission =
  | "users.read"
  | "users.history.read"
  | "users.create"
  | "users.update"
  | "users.updateProfile"
  | "users.changeRole"
  | "users.resetPassword"
  | "users.changeStatus"
  | "users.sessions.read"
  | "users.sessions.revoke"
  | "users.export"
  | "users.changeContractor"
  | "audit.read"
  | "audit.export"
  | "profile.read"
  | "profile.update"
  | "profile.sessions"
  | "settings.read"
  | "settings.company.read"
  | "settings.company.update"
  | "settings.company.history"
  | "customers.read"
  | "customers.create"
  | "customers.update"
  | "customers.changeStatus"
  | "customers.export"
  | "customers.history"
  | "contractors.read"
  | "contractors.create"
  | "contractors.update"
  | "contractors.changeStatus"
  | "contractors.export"
  | "contractors.history"
  | "projects.read"
  | "projects.readActive"
  | "projects.budget.read"
  | "projects.create"
  | "projects.update"
  | "projects.changeStatus"
  | "projects.delete"
  | "projects.export"
  | "projects.history"
  | "projects.participants"
  | "reports.readOwn"
  | "reports.writeOwn"
  | "reports.read"
  | "reports.write"
  | "reports.approve"
  | "reports.export"
  | "reports.import"
  | "reports.history";

type Grant = Permission | `${string}.*`;

// Listed rather than "reports.*": the wildcard would also grant reports.readOwn and
// reports.writeOwn, and administrators and managers do not file reports of their own
// (docs/ТЗ.md, 7.2).
const REPORTS_MANAGE = [
  "reports.read",
  "reports.write",
  "reports.approve",
  "reports.export",
  "reports.import",
  "reports.history",
] as const satisfies readonly Permission[];

/** The reports section: all reports, or only one's own (docs/ТЗ.md, 7.3). */
export const REPORTS_SECTION = [
  "reports.read",
  "reports.readOwn",
] as const satisfies readonly Permission[];

export const PERMISSIONS = {
  ADMIN: [
    "users.*",
    "audit.*",
    "profile.*",
    "settings.*",
    "customers.*",
    "contractors.*",
    "projects.*",
    ...REPORTS_MANAGE,
  ],
  MANAGER: [
    "users.read",
    "users.history.read",
    "users.updateProfile",
    "users.export",
    "profile.*",
    "settings.read",
    "settings.company.read",
    "settings.company.update",
    "settings.company.history",
    "customers.*",
    "contractors.*",
    "projects.read",
    "projects.readActive",
    "projects.budget.read",
    "projects.create",
    "projects.update",
    "projects.changeStatus",
    "projects.export",
    "projects.history",
    "projects.participants",
    ...REPORTS_MANAGE,
  ],
  EMPLOYEE: [
    "profile.read",
    "profile.sessions",
    "customers.read",
    "customers.history",
    "contractors.read",
    "contractors.history",
    "projects.read",
    "projects.readActive",
    "projects.history",
    "reports.readOwn",
    "reports.writeOwn",
  ],
  CONTRACTOR: [
    "profile.read",
    "profile.sessions",
    "projects.readActive",
    "reports.readOwn",
    "reports.writeOwn",
  ],
} as const satisfies Record<Role, readonly Grant[]>;

export function can(user: Pick<SessionUser, "role">, permission: Permission): boolean {
  const grants: readonly Grant[] = PERMISSIONS[user.role];

  return grants.some((grant) =>
    grant.endsWith(".*") ? permission.startsWith(grant.slice(0, -1)) : grant === permission,
  );
}

/** Whether the user holds at least one of the permissions, for a section several roles reach differently. */
export function canAny(
  user: Pick<SessionUser, "role">,
  permissions: readonly Permission[],
): boolean {
  return permissions.some((permission) => can(user, permission));
}

/**
 * The permission needed to edit another user: the profile of an administrator is edited only by
 * those who may edit any account (docs/ПРАВА-ДОСТУПА.md, 3.3).
 */
export function userUpdatePermission(target: Pick<SessionUser, "role">): Permission {
  return target.role === "ADMIN" ? "users.update" : "users.updateProfile";
}

export class PermissionDeniedError extends Error {
  constructor(readonly permission: Permission) {
    super(`Permission denied: ${permission}`);
    this.name = "PermissionDeniedError";
  }
}

/**
 * Throws PermissionDeniedError. Pages turn it into the access denied page and server actions
 * into a refusal, see requirePagePermission() and authorizedAction().
 */
export function requirePermission(user: Pick<SessionUser, "role">, permission: Permission): void {
  if (!can(user, permission)) throw new PermissionDeniedError(permission);
}
