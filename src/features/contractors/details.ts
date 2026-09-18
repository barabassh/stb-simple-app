import {
  detailEmail,
  detailPhone,
  detailText,
  type DetailGroup,
} from "@/components/details/detail-rows";
import { formatAddress } from "@/lib/nl/address";

import type { ContractorDetails } from "./queries";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** The saved contractor as its card shows it: the "name — value" rows of the company profile. */
export function contractorDetailGroup(
  contractor: ContractorDetails,
  t: Translate,
  locale: string,
): DetailGroup {
  const label = (key: string) => t(`contractors.fields.${key}`);

  return {
    key: "contractor",
    rows: [
      { key: "name", label: label("name"), value: detailText(contractor.name) },
      {
        key: "legalForm",
        label: label("legalForm"),
        value: detailText(
          contractor.legalForm && t(`settings.company.legalForms.${contractor.legalForm}`),
        ),
      },
      { key: "kvkNumber", label: label("kvkNumber"), value: detailText(contractor.kvkNumber) },
      { key: "vatId", label: label("vatId"), value: detailText(contractor.vatId) },
      {
        key: "contactPerson",
        label: label("contactPerson"),
        value: detailText(contractor.contactPerson),
      },
      { key: "email", label: label("email"), value: detailEmail(contractor.email) },
      { key: "phone", label: label("phone"), value: detailPhone(contractor.phone) },
      {
        key: "address",
        label: label("address"),
        // The country is filled together with the address, so an empty one has none.
        value: detailText(
          contractor.country &&
            formatAddress({ ...contractor, country: contractor.country }, locale),
        ),
      },
      { key: "comment", label: label("comment"), value: detailText(contractor.comment) },
    ],
  };
}
