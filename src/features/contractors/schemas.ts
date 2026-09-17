import { z } from "zod";

import { LegalForm } from "@/generated/prisma/enums";
import {
  addressSchema,
  emailField,
  kvkNumberField,
  optionalChoice,
  phoneField,
  vatNumberField,
} from "@/lib/nl/schemas";

// The contractor form (docs/ТЗ.md, 6.5): the same fields as a company customer plus the legal
// form, without the kind of customer. Formats and the address come from src/lib/nl.

const message = (key: string) => `contractors.validation.${key}`;

export const contractorFormSchema = z.object({
  name: z.string().trim().min(2, message("nameLength")).max(200, message("nameLength")),
  legalForm: optionalChoice(LegalForm),
  kvkNumber: kvkNumberField,
  vatId: vatNumberField,
  contactPerson: z.string().trim().max(120, message("contactPersonTooLong")),
  email: emailField,
  phone: phoneField,
  address: addressSchema("wholeOrNone"),
  comment: z.string().trim().max(1000, message("commentTooLong")),
});

export type ContractorFormInput = z.input<typeof contractorFormSchema>;
export type ContractorFormValues = z.output<typeof contractorFormSchema>;
