import { z } from "zod";

import { LegalForm, SocialNetwork } from "@/generated/prisma/enums";
import { displayTodayIso } from "@/lib/format";

import { COUNTRY_CODES } from "./countries";
import {
  isDutchPostcode,
  isEstablishmentNumber,
  isHttpsUrl,
  isKvkNumber,
  isPayrollTaxNumber,
  isPhone,
  isRsinFormat,
  isVatNumber,
  isWebsite,
  normalizeIdentifier,
  normalizePhone,
  normalizePostcode,
  passesElfproef,
} from "./nl-identifiers";

// One schema for the company form (docs/ТЗ.md, 5.4), parsed by the form and again by the action.
// As in the users schemas, strings are normalised in place and empty optional fields stay "":
// they become null when written.

const message = (key: string) => `settings.company.validation.${key}`;

export const COMPANY_LIST_LIMITS = {
  warehouses: 10,
  phones: 5,
  socialLinks: 10,
  activities: 20,
} as const;

const text = (max: number, key: string) => z.string().trim().max(max, message(key));

const requiredText = (min: number, max: number, key: string) =>
  z.string().trim().min(min, message(key)).max(max, message(key));

const optional = (check: (value: string) => boolean) => (value: string) =>
  value === "" || check(value);

const identifier = (check: (value: string) => boolean, key: string) =>
  z.string().transform(normalizeIdentifier).refine(optional(check), message(key));

/** "007" and "7" are the same house number. */
const wholeNumberInput = z
  .string()
  .trim()
  .transform((value) => (/^\d+$/.test(value) ? value.replace(/^0+(?=\d)/, "") : value));

const wholeNumber = (key: string) =>
  wholeNumberInput.refine((value) => /^[1-9]\d{0,4}$/.test(value), message(key));

const emailFormat = z.email();
const isoDate = z.iso.date();

const optionalAddressId = z.cuid().optional();

const postcodeField = z
  .string()
  .transform(normalizePostcode)
  .refine((value) => value !== "", message("postcodeRequired"));

const cityField = requiredText(1, 80, "cityLength");

const countryField = z.enum(COUNTRY_CODES, { error: message("countryRequired") });

/** Only Dutch postcodes follow the Dutch rules; the country is chosen in the same address. */
function checkPostcode(address: { postcode: string; country: string }, ctx: z.RefinementCtx) {
  if (address.postcode === "") return;

  const valid =
    address.country === "NL"
      ? isDutchPostcode(address.postcode)
      : /^[\p{L}\p{N} -]{2,12}$/u.test(address.postcode);

  if (!valid) {
    ctx.addIssue({
      code: "custom",
      message: message(address.country === "NL" ? "postcodeNl" : "postcodeForeign"),
      path: ["postcode"],
    });
  }
}

const streetAddressShape = {
  id: optionalAddressId,
  street: requiredText(1, 100, "streetLength"),
  houseNumber: wholeNumber("houseNumberInvalid"),
  houseNumberAddition: z
    .string()
    .trim()
    .regex(/^[\p{L}\p{N} -]{0,10}$/u, message("houseNumberAdditionInvalid")),
  postcode: postcodeField,
  city: cityField,
  country: countryField,
};

const streetAddressSchema = z.object(streetAddressShape).superRefine(checkPostcode);

const warehouseSchema = z
  .object({ ...streetAddressShape, name: text(100, "warehouseNameTooLong") })
  .superRefine(checkPostcode);

const postbusAddressSchema = z
  .object({
    id: optionalAddressId,
    postbus: wholeNumber("postbusInvalid"),
    postcode: postcodeField,
    city: cityField,
    country: countryField,
  })
  .superRefine(checkPostcode);

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

const phoneField = z
  .string()
  .transform(normalizePhone)
  .refine((value) => value === "" || isPhone(value), message("phoneInvalid"));

const additionalPhoneSchema = z.object({
  label: text(50, "phoneLabelTooLong"),
  number: phoneField.refine((value) => value !== "", message("phoneRequired")),
});

const socialLinkSchema = z.object({
  network: z.enum(SocialNetwork, { error: message("socialNetworkRequired") }),
  url: z
    .string()
    .trim()
    .max(255, message("urlTooLong"))
    .refine(isHttpsUrl, message("socialLinkInvalid")),
});

const activitySchema = z.object({
  sbiCode: z
    .string()
    .trim()
    .regex(/^\d{4,5}$/, message("sbiCodeInvalid")),
  description: requiredText(1, 200, "activityDescriptionLength"),
  isMain: z.boolean(),
});

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

    if (activities.length === 0) return;
    const mainCount = activities.filter((activity) => activity.isMain).length;
    if (mainCount !== 1) {
      ctx.addIssue({
        code: "custom",
        message: message(mainCount === 0 ? "mainActivityRequired" : "mainActivityNotUnique"),
      });
    }
  });

export const companyFormSchema = z
  .object({
    // The version the form was opened with; saving a stale version is rejected.
    version: z.number().int().nonnegative(),

    legalName: requiredText(2, 200, "legalNameLength"),
    tradeName: text(200, "tradeNameTooLong"),
    legalForm: z.enum(LegalForm, { error: message("legalFormRequired") }),
    registeredOn: z
      .string()
      .trim()
      .superRefine((value, ctx) => {
        if (value === "") return;
        if (!isoDate.safeParse(value).success) {
          ctx.addIssue({ code: "custom", message: message("dateInvalid") });
        } else if (value > displayTodayIso()) {
          ctx.addIssue({ code: "custom", message: message("registeredOnInFuture") });
        }
      }),
    statutorySeat: text(100, "statutorySeatTooLong"),

    kvkNumber: identifier(isKvkNumber, "kvkNumberInvalid"),
    establishmentNumber: identifier(isEstablishmentNumber, "establishmentNumberInvalid"),
    rsin: identifier(isRsinFormat, "rsinFormat").refine(
      optional((value) => !isRsinFormat(value) || passesElfproef(value)),
      message("rsinChecksum"),
    ),
    vatId: identifier(isVatNumber, "vatNumberFormat"),
    vatNumber: identifier(isVatNumber, "vatNumberFormat"),
    payrollTaxNumber: identifier(isPayrollTaxNumber, "payrollTaxNumberFormat"),

    officeAddress: streetAddressSchema,
    postalSameAsOffice: z.boolean(),
    postalAddress: postalAddressInputSchema,
    warehouses: z
      .array(warehouseSchema)
      .max(COMPANY_LIST_LIMITS.warehouses, message("warehousesTooMany")),

    email: z
      .string()
      .trim()
      .max(254, message("emailTooLong"))
      .refine((value) => emailFormat.safeParse(value).success, message("emailInvalid")),
    phone: phoneField.refine((value) => value !== "", message("phoneRequired")),
    phones: z
      .array(additionalPhoneSchema)
      .max(COMPANY_LIST_LIMITS.phones, message("phonesTooMany")),
    website: z
      .string()
      .trim()
      .max(255, message("urlTooLong"))
      .refine(optional(isWebsite), message("websiteInvalid")),
    socialLinks: z
      .array(socialLinkSchema)
      .max(COMPANY_LIST_LIMITS.socialLinks, message("socialLinksTooMany")),

    activities: activitiesSchema,
    activityDescription: text(1000, "activityDescriptionTooLong"),
  })
  .superRefine(
    ({ postalSameAsOffice, postalAddress }, ctx) => {
      if (postalSameAsOffice) return;

      const schema = postalAddress.isPostbus ? postbusAddressSchema : streetAddressSchema;
      for (const issue of schema.safeParse(postalAddress).error?.issues ?? []) {
        ctx.addIssue({
          code: "custom",
          message: issue.message,
          path: ["postalAddress", ...issue.path],
        });
      }
    },
    {
      // Zod skips object refinements after any type error, e.g. an unselected legal form; the
      // postal address errors must still appear with the rest, and depend only on these fields.
      when: ({ issues }) =>
        !issues.some(
          ({ path }) => path?.[0] === "postalSameAsOffice" || path?.[0] === "postalAddress",
        ),
    },
  );

export type CompanyFormInput = z.input<typeof companyFormSchema>;
export type CompanyFormValues = z.output<typeof companyFormSchema>;
