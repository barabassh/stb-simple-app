import { z } from "zod";

import { CustomerType } from "@/generated/prisma/enums";
import {
  addressSchema,
  emailField,
  kvkNumberField,
  phoneField,
  vatNumberField,
} from "@/lib/nl/schemas";

// The customer form (docs/ТЗ.md, 6.4), parsed by the form and again by the action. Formats,
// the address and its "all or nothing" rule come from src/lib/nl; as in the other schemas,
// empty optional fields stay "" here and become null when written.

const message = (key: string) => `customers.validation.${key}`;

/** The fields only a company has; a private customer is stored without them. */
const companyFieldsSchema = z.object({
  kvkNumber: kvkNumberField,
  vatId: vatNumberField,
  contactPerson: z.string().trim().max(120, message("contactPersonTooLong")),
});

const COMPANY_FIELDS = ["kvkNumber", "vatId", "contactPerson"];

const BLANK_COMPANY_FIELDS = { kvkNumber: "", vatId: "", contactPerson: "" };

export const customerFormSchema = z
  .object({
    type: z.enum(CustomerType, { error: message("typeRequired") }),
    name: z.string().trim().min(2, message("nameLength")).max(200, message("nameLength")),
    // Checked by companyFieldsSchema only for a company: what a private customer typed before
    // switching the kind is dropped, not reported.
    kvkNumber: z.string(),
    vatId: z.string(),
    contactPerson: z.string(),
    email: emailField,
    phone: phoneField,
    address: addressSchema("wholeOrNone"),
    comment: z.string().trim().max(1000, message("commentTooLong")),
  })
  .superRefine(
    (values, ctx) => {
      if (values.type !== "COMPANY") return;
      for (const issue of companyFieldsSchema.safeParse(values).error?.issues ?? []) {
        ctx.addIssue({ code: "custom", message: issue.message, path: issue.path });
      }
    },
    {
      // Zod skips object refinements after a type error anywhere in the form; the company fields
      // are checked as long as the kind and they themselves are readable.
      when: ({ issues }) =>
        issues.every(
          ({ path }) => path?.[0] !== "type" && !COMPANY_FIELDS.includes(String(path?.[0] ?? "")),
        ),
    },
  )
  .transform((values) =>
    values.type === "COMPANY"
      ? { ...values, ...companyFieldsSchema.parse(values) }
      : { ...values, ...BLANK_COMPANY_FIELDS },
  );

export type CustomerFormInput = z.input<typeof customerFormSchema>;
export type CustomerFormValues = z.output<typeof customerFormSchema>;
