import { referenceStatusName } from "@/components/reference-book/status-name";
import type { AuditValue } from "@/lib/audit";
import { formatAddress } from "@/lib/nl/address";
import { isBlankAddress } from "@/lib/nl/schemas";

import type { ContractorFormInput } from "./schemas";

type Translate = (key: string, values?: Record<string, string | number>) => string;

const orNull = (value: string) => (value === "" ? null : value);

/**
 * The contractor as the audit log shows it (docs/ТЗ.md, 6.10): the legal form by its name, the
 * address as one line, the status as "Активен" / "В архиве". Built from form values both before
 * and after a save, so that an unchanged form gives an identical snapshot.
 */
export function contractorAuditSnapshot(
  values: ContractorFormInput & { isActive: boolean },
  t: Translate,
  locale: string,
): Record<string, AuditValue> {
  return {
    name: values.name,
    legalForm: values.legalForm ? t(`settings.company.legalForms.${values.legalForm}`) : null,
    kvkNumber: orNull(values.kvkNumber),
    vatId: orNull(values.vatId),
    contactPerson: orNull(values.contactPerson),
    email: orNull(values.email),
    phone: orNull(values.phone),
    address: isBlankAddress(values.address) ? null : formatAddress(values.address, locale),
    comment: orNull(values.comment),
    isActive: referenceStatusName(values.isActive, t),
  };
}
