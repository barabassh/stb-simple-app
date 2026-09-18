import { addressInput, emptyAddressInput, type AddressColumns } from "@/lib/nl/schemas";

import type { CustomerFormInput } from "./schemas";

/** The stored fields the form edits, in the shape the record has in the database. */
export type CustomerFormRecord = AddressColumns & {
  type: CustomerFormInput["type"];
  name: string;
  kvkNumber: string | null;
  vatId: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  comment: string | null;
};

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
      address: emptyAddressInput,
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
    address: addressInput(customer),
    comment: customer.comment ?? "",
  };
}
