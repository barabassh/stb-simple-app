import { PROJECT_AUDIT_FIELDS } from "@/features/projects/audit";
import type { AuditEntity, AuditFieldRules } from "@/lib/audit";

/**
 * The fields of every entity whose values need a right of their own to be read. A Decimal field
 * of a model must be listed, with a right or as not financial: tests/unit/audit-fields.test.ts
 * fails otherwise, so a new money field does not reach an employee unnoticed.
 */
export const AUDIT_FIELD_RULES: Readonly<Record<AuditEntity, AuditFieldRules>> = {
  User: {},
  Session: {},
  AuditLog: {},
  CompanyProfile: {},
  Customer: {},
  Contractor: {},
  Project: PROJECT_AUDIT_FIELDS,
  WorkReport: {},
};

/** The rules of an entity as the log names it; an unknown name has none. */
export function auditFieldRules(entity: string): AuditFieldRules {
  return Object.hasOwn(AUDIT_FIELD_RULES, entity) ? AUDIT_FIELD_RULES[entity as AuditEntity] : {};
}
