import {
  detailEmail,
  detailPhone,
  detailText,
  type DetailGroup,
} from "@/components/details/detail-rows";
import { formatAddress } from "@/lib/nl/address";

import type { CustomerDetails } from "./queries";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * The saved customer as its card shows it (docs/ТЗ.md, 6.4): the same "name — value" rows as the
 * company profile, with the fields a private customer does not have left out.
 */
export function customerDetailGroup(
  customer: CustomerDetails,
  t: Translate,
  locale: string,
): DetailGroup {
  const label = (key: string) => t(`customers.fields.${key}`);
  const isCompany = customer.type === "COMPANY";
  const companyRows = isCompany
    ? [
        { key: "kvkNumber", label: label("kvkNumber"), value: detailText(customer.kvkNumber) },
        { key: "vatId", label: label("vatId"), value: detailText(customer.vatId) },
        {
          key: "contactPerson",
          label: label("contactPerson"),
          value: detailText(customer.contactPerson),
        },
      ]
    : [];

  return {
    key: "customer",
    rows: [
      {
        key: "type",
        label: label("type"),
        value: detailText(t(`customers.types.${customer.type}`)),
      },
      {
        key: "name",
        label: label(isCompany ? "name" : "personName"),
        value: detailText(customer.name),
      },
      ...companyRows,
      { key: "email", label: label("email"), value: detailEmail(customer.email) },
      { key: "phone", label: label("phone"), value: detailPhone(customer.phone) },
      {
        key: "address",
        label: label("address"),
        // The country is filled together with the address, so an empty one has none.
        value: detailText(
          customer.country && formatAddress({ ...customer, country: customer.country }, locale),
        ),
      },
      { key: "comment", label: label("comment"), value: detailText(customer.comment) },
    ],
  };
}
