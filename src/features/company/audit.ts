import type { AuditValue } from "@/lib/audit";
import { formatCalendarDate } from "@/lib/format";
import { formatAddress, type AddressParts } from "@/lib/nl/address";
import { isBlankAddress } from "@/lib/nl/schemas";

import type { CompanyFormInput } from "./schemas";

type Translate = (key: string, values?: Record<string, string | number>) => string;

const LIST_SEPARATOR = "; ";

const orNull = (value: string) => (value === "" ? null : value);

const joinList = (items: string[]) => orNull(items.join(LIST_SEPARATOR));

/**
 * The profile as the audit log shows it (docs/ТЗ.md, 5.8): codes by their names, an address and
 * each list as one line. Built from form values both before and after a save, so that an unchanged
 * form gives an identical snapshot; ids, sortOrder and version are left out on purpose.
 */
export function companyAuditSnapshot(
  values: CompanyFormInput,
  t: Translate,
  locale: string,
): Record<string, AuditValue> {
  // List rows are kept as typed, so either part of "label: value" may be missing.
  const labeled = (label: string, value: string) =>
    label && value ? t("settings.company.audit.labeled", { label, value }) : label || value;
  const address = (parts: AddressParts) => orNull(formatAddress(parts, locale));
  const { postalAddress } = values;

  return {
    legalName: values.legalName,
    tradeName: orNull(values.tradeName),
    legalForm: values.legalForm ? t(`settings.company.legalForms.${values.legalForm}`) : null,
    registeredOn: orNull(
      values.registeredOn && formatCalendarDate(new Date(`${values.registeredOn}T00:00:00Z`)),
    ),
    statutorySeat: orNull(values.statutorySeat),
    kvkNumber: orNull(values.kvkNumber),
    establishmentNumber: orNull(values.establishmentNumber),
    rsin: orNull(values.rsin),
    vatId: orNull(values.vatId),
    vatNumber: orNull(values.vatNumber),
    payrollTaxNumber: orNull(values.payrollTaxNumber),
    officeAddress: isBlankAddress(values.officeAddress) ? null : address(values.officeAddress),
    postalSameAsOffice: t(`settings.company.audit.${values.postalSameAsOffice ? "yes" : "no"}`),
    postalAddress:
      values.postalSameAsOffice || isBlankAddress(postalAddress)
        ? null
        : address(
            postalAddress.isPostbus
              ? { ...postalAddress, street: null, houseNumber: null, houseNumberAddition: null }
              : { ...postalAddress, postbus: null },
          ),
    warehouses: joinList(
      values.warehouses.map((warehouse) =>
        labeled(warehouse.name, formatAddress(warehouse, locale)),
      ),
    ),
    email: orNull(values.email),
    phone: orNull(values.phone),
    phones: joinList(values.phones.map((phone) => labeled(phone.label, phone.number))),
    website: orNull(values.website),
    socialLinks: joinList(
      values.socialLinks.map((link) =>
        labeled(link.network ? t(`settings.company.socialNetworks.${link.network}`) : "", link.url),
      ),
    ),
    activities: joinList(
      values.activities.map((activity) => {
        const text = [activity.sbiCode, activity.description].filter(Boolean).join(" — ");
        return activity.isMain
          ? t("settings.company.audit.mainActivity", { activity: text })
          : text;
      }),
    ),
    activityDescription: orNull(values.activityDescription),
  };
}
