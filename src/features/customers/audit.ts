import type { AuditValue } from "@/lib/audit";
import { formatAddress } from "@/lib/nl/address";
import { isBlankAddress } from "@/lib/nl/schemas";

import type { CustomerFormInput } from "./schemas";

type Translate = (key: string, values?: Record<string, string | number>) => string;

const orNull = (value: string) => (value === "" ? null : value);

export const customerStatusName = (isActive: boolean, t: Translate) =>
  t(isActive ? "customers.statuses.active" : "customers.statuses.archived");

/**
 * The customer as the audit log shows it (docs/ТЗ.md, 6.10): the kind by its name, the address as
 * one line, the status as "Активен" / "В архиве". Built from form values both before and after a
 * save, so that an unchanged form gives an identical snapshot.
 */
export function customerAuditSnapshot(
  values: CustomerFormInput & { isActive: boolean },
  t: Translate,
  locale: string,
): Record<string, AuditValue> {
  return {
    type: t(`customers.types.${values.type}`),
    name: values.name,
    kvkNumber: orNull(values.kvkNumber),
    vatId: orNull(values.vatId),
    contactPerson: orNull(values.contactPerson),
    email: orNull(values.email),
    phone: orNull(values.phone),
    address: isBlankAddress(values.address) ? null : formatAddress(values.address, locale),
    comment: orNull(values.comment),
    isActive: customerStatusName(values.isActive, t),
  };
}
