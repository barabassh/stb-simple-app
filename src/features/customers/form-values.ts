import { DEFAULT_COUNTRY, type CountryCode } from "@/lib/nl/countries";

import type { CustomerFormInput } from "./schemas";

/** The stored fields the form edits, in the shape the record has in the database. */
export type CustomerFormRecord = {
  type: CustomerFormInput["type"];
  name: string;
  kvkNumber: string | null;
  vatId: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  houseNumber: number | null;
  houseNumberAddition: string | null;
  postcode: string | null;
  city: string | null;
  country: string | null;
  comment: string | null;
};

export const emptyCustomerAddress = {
  street: "",
  houseNumber: "",
  houseNumberAddition: "",
  postcode: "",
  city: "",
  country: DEFAULT_COUNTRY,
} satisfies CustomerFormInput["address"];

/** The values the form opens with; a new customer is a company with an empty Dutch address. */
export function customerFormValues(customer: CustomerFormRecord | null): CustomerFormInput {
  if (!customer) {
    return {
      type: "COMPANY",
      name: "",
      kvkNumber: "",
      vatId: "",
      contactPerson: "",
      email: "",
      phone: "",
      address: emptyCustomerAddress,
      comment: "",
    };
  }

  return {
    type: customer.type,
    name: customer.name,
    kvkNumber: customer.kvkNumber ?? "",
    vatId: customer.vatId ?? "",
    contactPerson: customer.contactPerson ?? "",
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    address: {
      street: customer.street ?? "",
      houseNumber: customer.houseNumber?.toString() ?? "",
      houseNumberAddition: customer.houseNumberAddition ?? "",
      postcode: customer.postcode ?? "",
      city: customer.city ?? "",
      country: (customer.country as CountryCode | null) ?? DEFAULT_COUNTRY,
    },
    comment: customer.comment ?? "",
  };
}
