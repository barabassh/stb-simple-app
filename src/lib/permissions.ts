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
  | "audit.read"
  | "audit.export"
  | "profile.read"
  | "profile.update"
  | "profile.sessions"
  | "settings.read"
  | "settings.company.read"
  | "settings.company.update"
  | "settings.company.history";

type Grant = Permission | `${string}.*`;

export const PERMISSIONS = {
  ADMIN: ["users.*", "audit.*", "profile.*", "settings.*"],
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
  ],
  EMPLOYEE: ["profile.read", "profile.sessions"],
  CONTRACTOR: ["profile.read", "profile.sessions"],
} as const satisfies Record<Role, readonly Grant[]>;

export function can(user: Pick<SessionUser, "role">, permission: Permission): boolean {
  const grants: readonly Grant[] = PERMISSIONS[user.role];

  return grants.some((grant) =>
    grant.endsWith(".*") ? permission.startsWith(grant.slice(0, -1)) : grant === permission,
  );
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
