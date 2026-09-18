import type { LegalForm } from "@/generated/prisma/enums";
import { addressInput, emptyAddressInput, type AddressColumns } from "@/lib/nl/schemas";

import type { ContractorFormInput } from "./schemas";

/** The stored fields the form edits, in the shape the record has in the database. */
export type ContractorFormRecord = AddressColumns & {
  name: string;
  legalForm: LegalForm | null;
  kvkNumber: string | null;
  vatId: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  comment: string | null;
};

/** The values the form opens with; a new contractor has an empty Dutch address. */
export function contractorFormValues(contractor: ContractorFormRecord | null): ContractorFormInput {
  return {
    name: contractor?.name ?? "",
    legalForm: contractor?.legalForm ?? "",
    kvkNumber: contractor?.kvkNumber ?? "",
    vatId: contractor?.vatId ?? "",
    contactPerson: contractor?.contactPerson ?? "",
    email: contractor?.email ?? "",
    phone: contractor?.phone ?? "",
    address: contractor ? addressInput(contractor) : emptyAddressInput,
    comment: contractor?.comment ?? "",
  };
}
