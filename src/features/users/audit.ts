import type { Prisma } from "@/generated/prisma/client";
import { logAudit, type AuditActor, type AuditChange } from "@/lib/audit";
import type { ClientInfo } from "@/lib/request-info";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** The fields an administrator sets on a user, compared before and after a change. */
export const USER_AUDIT_SELECT = {
  login: true,
  fullName: true,
  position: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  comment: true,
} as const satisfies Prisma.UserSelect;

export type UserAuditRecord = Prisma.UserGetPayload<{ select: typeof USER_AUDIT_SELECT }>;

/** Role and status are logged by their names: codes would need decoding to be read. */
export function userAuditSnapshot(user: UserAuditRecord, t: Translate) {
  return {
    ...user,
    role: t(`users.roles.${user.role}`),
    isActive: t(user.isActive ? "users.statuses.active" : "users.statuses.inactive"),
  };
}

type UserChangeContext = {
  actor: AuditActor;
  request: ClientInfo;
  t: Translate;
  user: { id: string; login: string; isActive: boolean };
};

/**
 * A role or status change made through the edit form gets its own entry, so that filtering the
 * log by ROLE_CHANGE or STATUS_CHANGE finds it just like a change made by the dedicated action.
 */
export async function logUserChanges(
  client: Prisma.TransactionClient,
  { actor, request, t, user }: UserChangeContext,
  changes: AuditChange[],
): Promise<void> {
  const entry = { ...request, actor, entity: "User", entityId: user.id } as const;
  const values = { login: user.login };

  const other = changes.filter(({ field }) => field !== "role" && field !== "isActive");
  const role = changes.filter(({ field }) => field === "role");
  const status = changes.filter(({ field }) => field === "isActive");

  if (other.length > 0) {
    await logAudit(client, {
      ...entry,
      action: "UPDATE",
      summary: t("audit.summaries.userUpdated", values),
      changes: other,
    });
  }
  if (role.length > 0) {
    await logAudit(client, {
      ...entry,
      action: "ROLE_CHANGE",
      summary: t("audit.summaries.roleChanged", values),
      changes: role,
    });
  }
  if (status.length > 0) {
    await logAudit(client, {
      ...entry,
      action: "STATUS_CHANGE",
      summary: t(
        user.isActive ? "audit.summaries.userActivated" : "audit.summaries.userDeactivated",
        values,
      ),
      changes: status,
    });
  }
}
