import type { AuditFieldRules, AuditValue } from "@/lib/audit";
import { formatCalendarDate, formatDecimal, formatMoney } from "@/lib/format";
import { formatAddress } from "@/lib/nl/address";

import type { ProjectFormValues } from "./schemas";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * The budget is written to the log like any other field; a reader without projects.budget.read
 * sees only that it changed (docs/АРХИТЕКТУРА.md, 3.12), also in entries written before the right
 * was taken away.
 */
const budget = { readPermission: "projects.budget.read", withheldAs: "budget" } as const;

export const PROJECT_AUDIT_FIELDS: AuditFieldRules = {
  budgetAmount: budget,
  vatRate: budget,
  budgetHours: budget,
};

const orNull = (value: string) => (value === "" ? null : value);

/**
 * The project as the audit log shows it (docs/СХЕМА-БД.md, 9.4): the customer by its name, the
 * site address as one line, the date as dd.MM.yyyy, sums and hours in the number format of the
 * application and the VAT rate by its name. Built from parsed form values both before and after a
 * save, so that an unchanged form gives an identical snapshot. The status is not part of it: it
 * changes only through its own actions and entries.
 */
export function projectAuditSnapshot(
  values: ProjectFormValues,
  customerName: string,
  t: Translate,
  locale: string,
): Record<string, AuditValue> {
  return {
    number: values.number,
    name: values.name,
    customer: customerName,
    address: formatAddress(values.address, locale),
    startDate: formatCalendarDate(new Date(`${values.startDate}T00:00:00Z`)),
    description: orNull(values.description),
    budgetAmount: orNull(formatMoney(orNull(values.budgetAmount))),
    vatRate: values.vatRate ? t(`projects.vatRates.${values.vatRate}`) : null,
    budgetHours: orNull(formatDecimal(orNull(values.budgetHours))),
  };
}
