import type { Role } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/auth/session";

// Permission codes from docs/ПРАВА-ДОСТУПА.md, section 2.
export type Permission =
  | "users.read"
  | "users.create"
  | "users.update"
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
  | "profile.sessions";

type Grant = Permission | `${string}.*`;

export const PERMISSIONS = {
  ADMIN: ["users.*", "audit.*", "profile.*"],
  MANAGER: ["users.read", "users.export", "profile.*"],
  EMPLOYEE: ["profile.*"],
  CONTRACTOR: ["profile.*"],
} as const satisfies Record<Role, readonly Grant[]>;

export function can(user: Pick<SessionUser, "role">, permission: Permission): boolean {
  const grants: readonly Grant[] = PERMISSIONS[user.role];

  return grants.some((grant) =>
    grant.endsWith(".*") ? permission.startsWith(grant.slice(0, -1)) : grant === permission,
  );
}
