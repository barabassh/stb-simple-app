import { formatCalendarDate } from "@/lib/format";

import { formatAddress } from "./address";
import type { CompanyProfileRecord } from "./form-values";
import { isHttpsUrl, websiteUrl } from "./nl-identifiers";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** Null reads as "not set". An external link opens in a new tab. */
export type DetailValue =
  | { type: "text"; text: string }
  | { type: "link"; text: string; href: string; external: boolean }
  | null;

export type DetailRow = {
  key: string;
  label: string;
  value: DetailValue;
  /** A mark next to the value, such as the main activity's. */
  badge?: string;
};

export type DetailGroup = { key: string; title: string; rows: DetailRow[] };

const text = (value: string | null | undefined): DetailValue =>
  value ? { type: "text", text: value } : null;

const email = (value: string | null): DetailValue =>
  value ? { type: "link", text: value, href: `mailto:${value}`, external: false } : null;

const phone = (value: string | null): DetailValue =>
  value ? { type: "link", text: value, href: `tel:${value}`, external: false } : null;

// Values that fail the link rules are shown as text rather than turned into a link: a saved value
// has passed the schema, so this only guards against rows written around it.
function website(value: string | null): DetailValue {
  if (!value) return null;
  const url = websiteUrl(value);
  return url ? { type: "link", text: value, href: url.href, external: true } : text(value);
}

function socialLink(value: string | null): DetailValue {
  if (!value) return null;
  return isHttpsUrl(value)
    ? { type: "link", text: value, href: value, external: true }
    : text(value);
}

/**
 * The saved profile as the settings page shows it (docs/ТЗ.md, 5.6): the main table first, then
 * the groups that have something to show.
 */
export function companyDetailGroups(
  profile: CompanyProfileRecord,
  t: Translate,
  locale: string,
): DetailGroup[] {
  const label = (key: string, values?: Record<string, string | number>) =>
    t(`settings.company.details.${key}`, values);
  const byType = (type: CompanyProfileRecord["addresses"][number]["type"]) =>
    profile.addresses.filter((address) => address.type === type);
  const address = (parts: Parameters<typeof formatAddress>[0] | undefined) =>
    text(parts && formatAddress(parts, locale));

  const [office] = byType("OFFICE");
  const [postal] = byType("POSTAL");
  const warehouses = byType("WAREHOUSE");

  const groups: DetailGroup[] = [
    {
      key: "main",
      title: label("groups.main"),
      rows: [
        { key: "legalName", label: label("legalName"), value: text(profile.legalName) },
        { key: "officeAddress", label: label("address"), value: address(office) },
        { key: "email", label: label("email"), value: email(profile.email) },
        { key: "phone", label: label("phone"), value: phone(profile.phone) },
        { key: "website", label: label("website"), value: website(profile.website) },
        { key: "kvkNumber", label: label("kvkNumber"), value: text(profile.kvkNumber) },
        { key: "vatId", label: label("vatId"), value: text(profile.vatId) },
        { key: "vatNumber", label: label("vatNumber"), value: text(profile.vatNumber) },
      ],
    },
  ];

  const requisites = [
    profile.tradeName,
    profile.legalForm,
    profile.registeredOn,
    profile.statutorySeat,
    profile.establishmentNumber,
    profile.rsin,
    profile.payrollTaxNumber,
  ];
  if (requisites.some((value) => value != null)) {
    groups.push({
      key: "requisites",
      title: label("groups.requisites"),
      rows: [
        { key: "tradeName", label: label("tradeName"), value: text(profile.tradeName) },
        {
          key: "legalForm",
          label: label("legalForm"),
          value: text(profile.legalForm && t(`settings.company.legalForms.${profile.legalForm}`)),
        },
        {
          key: "registeredOn",
          label: label("registeredOn"),
          value: text(formatCalendarDate(profile.registeredOn)),
        },
        { key: "statutorySeat", label: label("statutorySeat"), value: text(profile.statutorySeat) },
        {
          key: "establishmentNumber",
          label: label("establishmentNumber"),
          value: text(profile.establishmentNumber),
        },
        { key: "rsin", label: label("rsin"), value: text(profile.rsin) },
        {
          key: "payrollTaxNumber",
          label: label("payrollTaxNumber"),
          value: text(profile.payrollTaxNumber),
        },
      ],
    });
  }

  // "Same as the office" says nothing while there is no office address to be the same as.
  const postalValue = profile.postalSameAsOffice
    ? office && text(label("postalSameAsOffice"))
    : address(postal);
  if (office || postalValue || warehouses.length > 0) {
    groups.push({
      key: "addresses",
      title: label("groups.addresses"),
      rows: [
        { key: "officeAddress", label: label("officeAddress"), value: address(office) },
        { key: "postalAddress", label: label("postalAddress"), value: postalValue ?? null },
        ...warehouses.map((warehouse, index) => ({
          key: `warehouse-${warehouse.id}`,
          label: warehouse.name || label("warehouse", { number: index + 1 }),
          value: address(warehouse),
        })),
      ],
    });
  }

  if (profile.phones.length > 0 || profile.socialLinks.length > 0) {
    groups.push({
      key: "contacts",
      title: label("groups.contacts"),
      rows: [
        ...profile.phones.map((row, index) => ({
          key: `phone-${index}`,
          label: row.label || label("extraPhone"),
          value: phone(row.number),
        })),
        ...profile.socialLinks.map((row, index) => ({
          key: `social-${index}`,
          // "Другая" alone does not say what the row is.
          label:
            row.network && row.network !== "OTHER"
              ? t(`settings.company.socialNetworks.${row.network}`)
              : label("socialLink"),
          value: socialLink(row.url),
        })),
      ],
    });
  }

  if (profile.activities.length > 0 || profile.activityDescription) {
    groups.push({
      key: "activities",
      title: label("groups.activities"),
      rows: [
        ...profile.activities.map((activity, index) => ({
          key: `activity-${index}`,
          label: activity.sbiCode || label("noSbiCode"),
          value: text(activity.description),
          badge: activity.isMain ? label("mainActivity") : undefined,
        })),
        {
          key: "activityDescription",
          label: label("activityDescription"),
          value: text(profile.activityDescription),
        },
      ],
    });
  }

  return groups;
}
