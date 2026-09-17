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
// they become null when written. Only the company name is required; an address is either left
// empty or filled completely, and blank rows of the lists are dropped.

const message = (key: string) => `settings.company.validation.${key}`;

export const COMPANY_LIST_LIMITS = {
  warehouses: 10,
  phones: 5,
  socialLinks: 10,
  activities: 20,
} as const;

const text = (max: number, key: string) => z.string().trim().max(max, message(key));

const optional = (check: (value: string) => boolean) => (value: string) =>
  value === "" || check(value);

const identifier = (check: (value: string) => boolean, key: string) =>
  z.string().transform(normalizeIdentifier).refine(optional(check), message(key));

/** "007" and "7" are the same house number. */
const wholeNumberInput = z
  .string()
  .trim()
  .transform((value) => (/^\d+$/.test(value) ? value.replace(/^0+(?=\d)/, "") : value));

const isWholeNumber = (value: string) => /^[1-9]\d{0,4}$/.test(value);

const emailFormat = z.email();
const isoDate = z.iso.date();

const optionalAddressId = z.cuid().optional();

const countryCodes: ReadonlySet<string> = new Set(COUNTRY_CODES);

/** A choice that may be left empty: "" in the form, undefined once parsed. */
const optionalChoice = <T extends Record<string, string>>(values: T) =>
  z
    .union([z.enum(values), z.literal("")], { error: message("optionInvalid") })
    .optional()
    .transform((value) => value || undefined);

type AddressValues = {
  isPostbus?: boolean;
  street: string;
  houseNumber: string;
  houseNumberAddition: string;
  postbus?: string;
  postcode: string;
  city: string;
  country: string;
};

/**
 * Checks an address typed into the form. A `complete` address (the office, the postal one) may be
 * left empty, but once any of its fields is filled, the street, house number (or PO box), postcode
 * and city are required. A warehouse is saved as typed: only the formats of filled fields count.
 */
function checkAddress(
  address: AddressValues,
  report: (field: string, key: string) => void,
  { complete }: { complete: boolean },
) {
  const lines = address.isPostbus
    ? [address.postbus ?? ""]
    : [address.street, address.houseNumber, address.houseNumberAddition];
  const started = [...lines, address.postcode, address.city].some((value) => value !== "");
  const required = complete && started;

  if (address.isPostbus) {
    const postbus = address.postbus ?? "";
    if ((required || postbus !== "") && !isWholeNumber(postbus))
      report("postbus", "postbusInvalid");
  } else {
    if ((required && address.street === "") || address.street.length > 100) {
      report("street", "streetLength");
    }
    if ((required || address.houseNumber !== "") && !isWholeNumber(address.houseNumber)) {
      report("houseNumber", "houseNumberInvalid");
    }
    if (!/^[\p{L}\p{N} -]{0,10}$/u.test(address.houseNumberAddition)) {
      report("houseNumberAddition", "houseNumberAdditionInvalid");
    }
  }

  if (address.postcode === "") {
    if (required) report("postcode", "postcodeRequired");
  } else {
    // Only Dutch postcodes follow the Dutch rules; the country is chosen in the same address.
    const valid =
      address.country === "NL"
        ? isDutchPostcode(address.postcode)
        : /^[\p{L}\p{N} -]{2,12}$/u.test(address.postcode);
    if (!valid) report("postcode", address.country === "NL" ? "postcodeNl" : "postcodeForeign");
  }

  if ((required && address.city === "") || address.city.length > 80) {
    report("city", "cityLength");
  }
  if (started && !countryCodes.has(address.country)) report("country", "countryRequired");
}

const addressShape = {
  id: optionalAddressId,
  street: z.string().trim(),
  houseNumber: wholeNumberInput,
  houseNumberAddition: z.string().trim(),
  postcode: z.string().transform(normalizePostcode),
  city: z.string().trim(),
  country: z.enum(COUNTRY_CODES, { error: message("countryRequired") }),
};

const addressRefinement =
  (options: { complete: boolean }) => (address: AddressValues, ctx: z.RefinementCtx) =>
    checkAddress(
      address,
      (field, key) => {
        // The country enum has already reported itself.
        if (field !== "country") {
          ctx.addIssue({ code: "custom", message: message(key), path: [field] });
        }
      },
      options,
    );

// Zod skips object refinements after any issue in the object; an invalid country or a too long
// warehouse name leaves the address fields readable and must not hide their errors.
const addressFieldsReadable = {
  when: ({ issues }: { issues: { path?: PropertyKey[] }[] }) =>
    issues.every(({ path }) => path?.[0] === "country" || path?.[0] === "name"),
};

const officeAddressSchema = z
  .object(addressShape)
  .superRefine(addressRefinement({ complete: true }), addressFieldsReadable);

const warehouseSchema = z
  .object({ ...addressShape, name: text(100, "warehouseNameTooLong") })
  .superRefine(addressRefinement({ complete: false }), addressFieldsReadable);

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
  .refine(optional(isPhone), message("phoneInvalid"));

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

export function isBlankAddress(address: AddressValues & { name?: string }): boolean {
  const fields = address.isPostbus
    ? [address.postbus ?? "", address.postcode, address.city]
    : [
        address.name ?? "",
        address.street,
        address.houseNumber,
        address.houseNumberAddition,
        address.postcode,
        address.city,
      ];
  return fields.every((value) => value === "");
}

const activitySchema = z.object({
  sbiCode: z
    .string()
    .trim()
    .refine(
      optional((value) => /^\d{4,5}$/.test(value)),
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

    officeAddress: officeAddressSchema,
    postalSameAsOffice: z.boolean(),
    postalAddress: postalAddressInputSchema,
    warehouses: listOf(
      warehouseSchema,
      COMPANY_LIST_LIMITS.warehouses,
      "warehousesTooMany",
      isBlankAddress,
    ),

    email: z
      .string()
      .trim()
      .max(254, message("emailTooLong"))
      .refine(
        optional((value) => emailFormat.safeParse(value).success),
        message("emailInvalid"),
      ),
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
      .refine(optional(isWebsite), message("websiteInvalid")),
    socialLinks: listOf(
      z.object({
        network: optionalChoice(SocialNetwork),
        url: z
          .string()
          .trim()
          .max(255, message("urlTooLong"))
          .refine(optional(isHttpsUrl), message("socialLinkInvalid")),
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
          ctx.addIssue({ code: "custom", message: message(key), path: ["postalAddress", field] }),
        { complete: true },
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
