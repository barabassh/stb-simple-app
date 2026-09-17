import type { CompanyAddress, CompanyProfile } from "@/generated/prisma/client";
import { DEFAULT_COUNTRY } from "@/lib/nl/countries";

import type { CompanyFormInput } from "./schemas";

/** A saved profile with its active addresses and lists, as getCompanyProfile returns it. */
export type CompanyProfileRecord = CompanyProfile & {
  addresses: CompanyAddress[];
  phones: { label: string | null; number: string | null }[];
  socialLinks: {
    network: CompanyFormInput["socialLinks"][number]["network"] | null;
    url: string | null;
  }[];
  activities: { sbiCode: string | null; description: string | null; isMain: boolean }[];
};

export const emptyStreetAddress = {
  street: "",
  houseNumber: "",
  houseNumberAddition: "",
  postcode: "",
  city: "",
  country: DEFAULT_COUNTRY,
} satisfies CompanyFormInput["officeAddress"];

const emptyPostalAddress: CompanyFormInput["postalAddress"] = {
  ...emptyStreetAddress,
  isPostbus: false,
  postbus: "",
};

function streetAddressValues(address: CompanyAddress) {
  return {
    id: address.id,
    street: address.street ?? "",
    houseNumber: address.houseNumber?.toString() ?? "",
    houseNumberAddition: address.houseNumberAddition ?? "",
    postcode: address.postcode ?? "",
    city: address.city ?? "",
    country: address.country as CompanyFormInput["officeAddress"]["country"],
  };
}

/**
 * The values the form opens with. A new profile has version 0: saving it creates the record,
 * and fails if someone else created it in the meantime.
 */
export function companyFormValues(profile: CompanyProfileRecord | null): CompanyFormInput {
  const byType = (type: CompanyAddress["type"]) =>
    profile?.addresses.filter((address) => address.type === type) ?? [];
  const [office] = byType("OFFICE");
  const [postal] = byType("POSTAL");

  return {
    version: profile?.version ?? 0,
    legalName: profile?.legalName ?? "",
    tradeName: profile?.tradeName ?? "",
    // Unselected until chosen: the form must not suggest a legal form.
    legalForm: profile?.legalForm ?? "",
    registeredOn: profile?.registeredOn?.toISOString().slice(0, 10) ?? "",
    statutorySeat: profile?.statutorySeat ?? "",
    kvkNumber: profile?.kvkNumber ?? "",
    establishmentNumber: profile?.establishmentNumber ?? "",
    rsin: profile?.rsin ?? "",
    vatId: profile?.vatId ?? "",
    vatNumber: profile?.vatNumber ?? "",
    payrollTaxNumber: profile?.payrollTaxNumber ?? "",
    officeAddress: office ? streetAddressValues(office) : emptyStreetAddress,
    postalSameAsOffice: profile?.postalSameAsOffice ?? true,
    postalAddress: postal
      ? {
          ...streetAddressValues(postal),
          isPostbus: !!postal.postbus,
          postbus: postal.postbus ?? "",
        }
      : emptyPostalAddress,
    warehouses: byType("WAREHOUSE").map((address) => ({
      ...streetAddressValues(address),
      name: address.name ?? "",
    })),
    email: profile?.email ?? "",
    phone: profile?.phone ?? "",
    phones:
      profile?.phones.map(({ label, number }) => ({ label: label ?? "", number: number ?? "" })) ??
      [],
    website: profile?.website ?? "",
    socialLinks:
      profile?.socialLinks.map(({ network, url }) => ({
        network: network ?? "",
        url: url ?? "",
      })) ?? [],
    activities:
      profile?.activities.map(({ sbiCode, description, isMain }) => ({
        sbiCode: sbiCode ?? "",
        description: description ?? "",
        isMain,
      })) ?? [],
    activityDescription: profile?.activityDescription ?? "",
  };
}
