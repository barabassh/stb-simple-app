import type { AuditAction, Prisma } from "@/generated/prisma/client";

// Rules for what is written and how: docs/СХЕМА-БД.md, section 4.

/**
 * Values of these fields never reach the log. The list is explicit on purpose: a rule like
 * "the name contains password" would sooner or later let `secretKey` or `apiToken` through.
 */
export const AUDIT_EXCLUDED_FIELDS = [
  "passwordHash",
  "password",
  "newPassword",
  "tokenHash",
] as const;

const excludedFields: ReadonlySet<string> = new Set(AUDIT_EXCLUDED_FIELDS);

/** Model names written to `AuditLog.entity`; a new entity is added here and to `audit.entities`. */
export const AUDIT_ENTITIES = ["User", "Session"] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

export type AuditValue = string | number | boolean | null;

export type AuditChange = { field: string; before: AuditValue; after: AuditValue };

/** `id` is null when there is no account behind the login, e.g. for a failed sign-in. */
export type AuditActor = { id: string | null; login: string };

export type AuditEntry = {
  actor: AuditActor;
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string | null;
  summary: string;
  changes?: AuditChange[] | null;
  ip?: string | null;
  userAgent?: string | null;
};

function toAuditValue(value: unknown): AuditValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * Lists the fields whose values differ between two snapshots of a record; `before` is null for a
 * created record. Snapshots should already hold readable values (a role name, not its code),
 * because the log has to make sense without decoding.
 */
export function diffEntity(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): AuditChange[] {
  const fields = new Set([...Object.keys(after ?? {}), ...Object.keys(before ?? {})]);
  const changes: AuditChange[] = [];

  for (const field of fields) {
    if (excludedFields.has(field)) continue;
    const previous = toAuditValue(before?.[field]);
    const next = toAuditValue(after?.[field]);
    if (previous !== next) changes.push({ field, before: previous, after: next });
  }

  return changes;
}

function isAuditValue(value: unknown): value is AuditValue {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

/** Reads `AuditLog.changes` back, skipping anything that does not have the written shape. */
export function readAuditChanges(value: unknown): AuditChange[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item: unknown) => {
    if (typeof item !== "object" || item === null) return [];
    const { field, before, after } = item as Record<string, unknown>;
    return typeof field === "string" && isAuditValue(before) && isAuditValue(after)
      ? [{ field, before, after }]
      : [];
  });
}

/**
 * Pass the transaction client of the change being logged: the entry must not outlive a change
 * that was rolled back, nor a change be kept without its entry.
 */
export async function logAudit(client: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
  // Changes built by hand bypass diffEntity, so the excluded fields are dropped here as well.
  const changes = entry.changes?.filter(({ field }) => !excludedFields.has(field));

  await client.auditLog.create({
    data: {
      actorId: entry.actor.id,
      actorLogin: entry.actor.login,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      summary: entry.summary,
      ...(changes && changes.length > 0 ? { changes } : {}),
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
    },
  });
}
