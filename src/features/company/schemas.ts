import { z } from "zod";

import { LegalForm, SocialNetwork } from "@/generated/prisma/enums";
import { displayTodayIso } from "@/lib/format";
import {
  isEstablishmentNumber,
  isHttpsUrl,
  isPayrollTaxNumber,
  isRsinFormat,
  isWebsite,
  normalizePostcode,
  passesElfproef,
} from "@/lib/nl/identifiers";
import {
  addressFieldsReadable,
  addressRefinement,
  addressShape,
  checkAddress,
  emailField,
  identifierField,
  isBlankAddress,
  isoDateFormat,
  kvkNumberField,
  optionalChoice,
  optionalFormat,
  phoneField,
  validationMessage,
  vatNumberField,
  wholeNumberInput,
} from "@/lib/nl/schemas";

// One schema for the company form (docs/ТЗ.md, 5.4), parsed by the form and again by the action.
// As in the users schemas, strings are normalised in place and empty optional fields stay "":
// they become null when written. Only the company name is required; an address is either left
// empty or filled completely, and blank rows of the lists are dropped. Formats and address rules
// shared with customers, contractors and projects come from src/lib/nl.

const message = (key: string) => `settings.company.validation.${key}`;

export const COMPANY_LIST_LIMITS = {
  warehouses: 10,
  phones: 5,
  socialLinks: 10,
  activities: 20,
} as const;

const text = (max: number, key: string) => z.string().trim().max(max, message(key));

const identifier = (check: (value: string) => boolean, key: string) =>
  identifierField(check, message(key));

const optionalAddressId = z.cuid().optional();

const officeAddressSchema = z
  .object({ ...addressShape, id: optionalAddressId })
  .superRefine(addressRefinement("wholeOrNone"), addressFieldsReadable());

const warehouseSchema = z
  .object({ ...addressShape, id: optionalAddressId, name: text(100, "warehouseNameTooLong") })
  .superRefine(addressRefinement("asTyped"), addressFieldsReadable("name"));

/**
 * The postal address keeps what was typed while "same as office" is ticked, so here its fields are
 * only normalised; companyFormSchema applies the address rules once the box is cleared.
 */
const postalAddressInputSchema = z.object({
  id: optionalAddressId,
  isPostbus: z.boolean(),
  street: z.string().trim(),
  houseNumber: wholeNumberInput,
  houseNumberAddition: z.string().trim(),
  postbus: wholeNumberInput,
  postcode: z.string().transform(normalizePostcode),
  city: z.string().trim(),
  country: z.string(),
});

/** A list of rows whose blank rows are dropped: an added and untouched row means nothing. */
function listOf<T extends z.ZodType>(
  row: T,
  max: number,
  key: string,
  isBlank: (row: z.output<T>) => boolean,
) {
  return z
    .array(row)
    .max(max, message(key))
    .transform((rows) => rows.filter((item) => !isBlank(item)));
}

const activitySchema = z.object({
  sbiCode: z
    .string()
    .trim()
    .refine(
      optionalFormat((value) => /^\d{4,5}$/.test(value)),
      message("sbiCodeInvalid"),
    ),
  description: text(200, "activityDescriptionLength"),
  isMain: z.boolean(),
});

const isBlankActivity = (activity: { sbiCode: string; description: string }) =>
  activity.sbiCode === "" && activity.description === "";

const activitiesSchema = z
  .array(activitySchema)
  .max(COMPANY_LIST_LIMITS.activities, message("activitiesTooMany"))
  .superRefine((activities, ctx) => {
    const seen = new Set<string>();
    activities.forEach(({ sbiCode }, index) => {
      if (sbiCode === "") return;
      if (seen.has(sbiCode)) {
        ctx.addIssue({
          code: "custom",
          message: message("sbiCodeDuplicate"),
          path: [index, "sbiCode"],
        });
      }
      seen.add(sbiCode);
    });

    const filled = activities.filter((activity) => !isBlankActivity(activity));
    if (filled.length === 0) return;
    const mainCount = filled.filter((activity) => activity.isMain).length;
    if (mainCount !== 1) {
      ctx.addIssue({
        code: "custom",
        message: message(mainCount === 0 ? "mainActivityRequired" : "mainActivityNotUnique"),
      });
    }
  })
  .transform((activities) => activities.filter((activity) => !isBlankActivity(activity)));

export const companyFormSchema = z
  .object({
    // The version the form was opened with; saving a stale version is rejected.
    version: z.number().int().nonnegative(),

    legalName: z
      .string()
      .trim()
      .min(2, message("legalNameLength"))
      .max(200, message("legalNameLength")),
    tradeName: text(200, "tradeNameTooLong"),
    legalForm: optionalChoice(LegalForm),
    registeredOn: z
      .string()
      .trim()
      .superRefine((value, ctx) => {
        if (value === "") return;
        if (!isoDateFormat.safeParse(value).success) {
          ctx.addIssue({ code: "custom", message: validationMessage("dateInvalid") });
        } else if (value > displayTodayIso()) {
          ctx.addIssue({ code: "custom", message: message("registeredOnInFuture") });
        }
      }),
    statutorySeat: text(100, "statutorySeatTooLong"),

    kvkNumber: kvkNumberField,
    establishmentNumber: identifier(isEstablishmentNumber, "establishmentNumberInvalid"),
    rsin: identifier(isRsinFormat, "rsinFormat").refine(
      optionalFormat((value) => !isRsinFormat(value) || passesElfproef(value)),
      message("rsinChecksum"),
    ),
    vatId: vatNumberField,
    vatNumber: vatNumberField,
    payrollTaxNumber: identifier(isPayrollTaxNumber, "payrollTaxNumberFormat"),

    officeAddress: officeAddressSchema,
    postalSameAsOffice: z.boolean(),
    postalAddress: postalAddressInputSchema,
    warehouses: listOf(
      warehouseSchema,
      COMPANY_LIST_LIMITS.warehouses,
      "warehousesTooMany",
      isBlankAddress,
    ),

    email: emailField,
    phone: phoneField,
    phones: listOf(
      z.object({ label: text(50, "phoneLabelTooLong"), number: phoneField }),
      COMPANY_LIST_LIMITS.phones,
      "phonesTooMany",
      (phone) => phone.label === "" && phone.number === "",
    ),
    website: z
      .string()
      .trim()
      .max(255, message("urlTooLong"))
      .refine(optionalFormat(isWebsite), message("websiteInvalid")),
    socialLinks: listOf(
      z.object({
        network: optionalChoice(SocialNetwork),
        url: z
          .string()
          .trim()
          .max(255, message("urlTooLong"))
          .refine(optionalFormat(isHttpsUrl), message("socialLinkInvalid")),
      }),
      COMPANY_LIST_LIMITS.socialLinks,
      "socialLinksTooMany",
      (link) => !link.network && link.url === "",
    ),

    activities: activitiesSchema,
    activityDescription: text(1000, "activityDescriptionTooLong"),
  })
  .superRefine(
    ({ postalSameAsOffice, postalAddress }, ctx) => {
      if (postalSameAsOffice) return;
      checkAddress(
        postalAddress,
        (field, key) =>
          ctx.addIssue({
            code: "custom",
            message: validationMessage(key),
            path: ["postalAddress", field],
          }),
        "wholeOrNone",
      );
    },
    {
      // Zod skips object refinements after any type error elsewhere in the form; the postal
      // address errors must still appear with the rest, and depend only on these fields.
      when: ({ issues }) =>
        !issues.some(
          ({ path }) => path?.[0] === "postalSameAsOffice" || path?.[0] === "postalAddress",
        ),
    },
  );

export type CompanyFormInput = z.input<typeof companyFormSchema>;
export type CompanyFormValues = z.output<typeof companyFormSchema>;
