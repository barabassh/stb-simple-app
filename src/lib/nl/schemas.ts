import { z } from "zod";

import { COUNTRY_CODES } from "./countries";
import {
  isDutchPostcode,
  isKvkNumber,
  isPhone,
  isVatNumber,
  normalizeIdentifier,
  normalizePhone,
  normalizePostcode,
} from "./identifiers";

// Form fields shared by the company profile, customers, contractors and projects (docs/ТЗ.md, 5.4
// and 6.4–6.6). As in the users schemas, strings are normalised in place and empty optional
// fields stay "": they become null when written.

/** A key of the shared `validation` section of messages/ru.json. */
export const validationMessage = (key: string) => `validation.${key}`;

export const optionalFormat = (check: (value: string) => boolean) => (value: string) =>
  value === "" || check(value);

export const identifierField = (check: (value: string) => boolean, messageKey: string) =>
  z.string().transform(normalizeIdentifier).refine(optionalFormat(check), messageKey);

export const kvkNumberField = identifierField(isKvkNumber, validationMessage("kvkNumberInvalid"));

/** A btw-id or an omzetbelastingnummer. */
export const vatNumberField = identifierField(isVatNumber, validationMessage("vatNumberFormat"));

const emailFormat = z.email();

/** Kept as typed, without changing the case. */
export const emailField = z
  .string()
  .trim()
  .max(254, validationMessage("emailTooLong"))
  .refine(
    optionalFormat((value) => emailFormat.safeParse(value).success),
    validationMessage("emailInvalid"),
  );

export const phoneField = z
  .string()
  .transform(normalizePhone)
  .refine(optionalFormat(isPhone), validationMessage("phoneInvalid"));

/** A choice that may be left empty: "" in the form, undefined once parsed. */
export const optionalChoice = <T extends Record<string, string>>(values: T) =>
  z
    .union([z.enum(values), z.literal("")], { error: validationMessage("optionInvalid") })
    .optional()
    .transform((value) => value || undefined);

export const isoDateFormat = z.iso.date();

/** "007" and "7" are the same house number. */
export const wholeNumberInput = z
  .string()
  .trim()
  .transform((value) => (/^\d+$/.test(value) ? value.replace(/^0+(?=\d)/, "") : value));

const isWholeNumber = (value: string) => /^[1-9]\d{0,4}$/.test(value);

const countryCodes: ReadonlySet<string> = new Set(COUNTRY_CODES);

export type AddressValues = {
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
 * How much of an address must be filled:
 * - `asTyped` — nothing is required, only the formats of filled fields count (a warehouse);
 * - `wholeOrNone` — may be left empty, but once any field is filled, the street, house number
 *   (or PO box), postcode and city are required (the office, a customer);
 * - `required` — those fields are required even in an empty address (a project site).
 */
export type AddressRule = "asTyped" | "wholeOrNone" | "required";

export function checkAddress(
  address: AddressValues,
  report: (field: string, key: string) => void,
  rule: AddressRule,
) {
  const lines = address.isPostbus
    ? [address.postbus ?? ""]
    : [address.street, address.houseNumber, address.houseNumberAddition];
  const started = [...lines, address.postcode, address.city].some((value) => value !== "");
  const required = rule === "required" || (rule === "wholeOrNone" && started);

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
  if ((started || required) && !countryCodes.has(address.country)) {
    report("country", "countryRequired");
  }
}

export const addressShape = {
  street: z.string().trim(),
  houseNumber: wholeNumberInput,
  houseNumberAddition: z.string().trim(),
  postcode: z.string().transform(normalizePostcode),
  city: z.string().trim(),
  country: z.enum(COUNTRY_CODES, { error: validationMessage("countryRequired") }),
};

/** Reports address errors as issues of the address object's fields. */
export const addressRefinement =
  (rule: AddressRule) => (address: AddressValues, ctx: z.RefinementCtx) =>
    checkAddress(
      address,
      (field, key) => {
        // The country enum has already reported itself.
        if (field !== "country") {
          ctx.addIssue({ code: "custom", message: validationMessage(key), path: [field] });
        }
      },
      rule,
    );

/**
 * Zod skips object refinements after any issue in the object; an invalid country (or another
 * field of the same object, such as a warehouse name) leaves the address fields readable and must
 * not hide their errors.
 */
export const addressFieldsReadable = (...otherFields: string[]) => ({
  when: ({ issues }: { issues: { path?: PropertyKey[] }[] }) =>
    issues.every(({ path }) => path?.[0] === "country" || otherFields.includes(String(path?.[0]))),
});

export const addressSchema = (rule: AddressRule) =>
  z.object(addressShape).superRefine(addressRefinement(rule), addressFieldsReadable());

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
