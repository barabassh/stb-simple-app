import { z } from "zod";

import { VatRate } from "@/generated/prisma/enums";
import { addressSchema, isoDateFormat, optionalChoice, validationMessage } from "@/lib/nl/schemas";

import { parseDecimalInput } from "./budget";

// The project form (docs/ТЗ.md, 6.6), parsed by the form and again by the action. Amounts and
// hours are kept as exact decimal strings: the form types them with a comma, the database stores
// them as Decimal, and no value ever passes through a floating point number.

const message = (key: string) => `projects.validation.${key}`;

/** Up to 999 999 999 999,99 euros and 99 999 999,99 hours (docs/ТЗ.md, 6.6). */
export const AMOUNT_WHOLE_DIGITS = 12;
const HOURS_WHOLE_DIGITS = 8;

const decimalField = (maxWholeDigits: number, key: string) =>
  z
    .string()
    .trim()
    .refine(
      (value) => value === "" || parseDecimalInput(value, maxWholeDigits) !== null,
      message(key),
    )
    .transform((value) => (value === "" ? "" : (parseDecimalInput(value, maxWholeDigits) ?? "")));

export const projectFormSchema = z
  .object({
    number: z
      .string()
      .trim()
      .min(1, message("numberRequired"))
      .max(20, message("numberTooLong"))
      .regex(/^[A-Za-z0-9./-]*$/, message("numberFormat")),
    name: z.string().trim().min(2, message("nameLength")).max(200, message("nameLength")),
    customerId: z.cuid(message("customerRequired")),
    address: addressSchema("required"),
    startDate: z
      .string()
      .trim()
      .min(1, message("startDateRequired"))
      .refine(
        (value) => value === "" || isoDateFormat.safeParse(value).success,
        validationMessage("dateInvalid"),
      ),
    description: z.string().trim().max(2000, message("descriptionTooLong")),
    budgetAmount: decimalField(AMOUNT_WHOLE_DIGITS, "budgetAmountInvalid"),
    vatRate: optionalChoice(VatRate),
    budgetHours: decimalField(HOURS_WHOLE_DIGITS, "budgetHoursInvalid"),
  })
  .superRefine(
    ({ budgetAmount, vatRate }, ctx) => {
      if (budgetAmount !== "" && !vatRate) {
        ctx.addIssue({ code: "custom", message: message("vatRateRequired"), path: ["vatRate"] });
      }
    },
    {
      // Zod skips object refinements after a type error anywhere in the form; the missing rate
      // depends only on these two fields.
      when: ({ issues }) =>
        !issues.some(({ path }) => path?.[0] === "budgetAmount" || path?.[0] === "vatRate"),
    },
  )
  // A rate without an amount means nothing and is not stored: the form offers 21 % from the start.
  .transform((values) => (values.budgetAmount === "" ? { ...values, vatRate: undefined } : values));

export type ProjectFormInput = z.input<typeof projectFormSchema>;
export type ProjectFormValues = z.output<typeof projectFormSchema>;
