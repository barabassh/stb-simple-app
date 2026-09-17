import type { z } from "zod";
import { describe, expect, it } from "vitest";

import { contractorFormSchema } from "@/features/contractors/schemas";
import { customerFormSchema, type CustomerFormInput } from "@/features/customers/schemas";

import ru from "../../messages/ru.json";

const emptyAddress = {
  street: "",
  houseNumber: "",
  houseNumberAddition: "",
  postcode: "",
  city: "",
  country: "NL",
} as const;

const address = {
  street: "de Geerenweg",
  houseNumber: "4",
  houseNumberAddition: "E",
  postcode: "3741rs",
  city: "Baarn",
  country: "NL",
} as const;

const company: CustomerFormInput = {
  type: "COMPANY",
  name: "SmartZaken B.V.",
  kvkNumber: "9354 1082",
  vatId: "nl005025949b57",
  contactPerson: "Jan de Vries",
  email: "info@SmartZaken.nl",
  phone: "06 84 61 47 32",
  address: emptyAddress,
  comment: "",
};

const messagesFor = (result: z.ZodSafeParseResult<unknown>) =>
  result.success ? [] : result.error.issues.map((issue) => [issue.path.join("."), issue.message]);

const parse = (values: Partial<CustomerFormInput>) =>
  customerFormSchema.safeParse({ ...company, ...values });

describe("customerFormSchema", () => {
  it("normalises the numbers, the phone and the postcode of a company", () => {
    const result = parse({ address });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      kvkNumber: "93541082",
      vatId: "NL005025949B57",
      phone: "+31684614732",
      email: "info@SmartZaken.nl",
      address: { postcode: "3741 RS", houseNumber: "4" },
    });
  });

  it("drops the company fields of a private customer, whatever was typed before", () => {
    const result = parse({ type: "PERSON", name: "Jan de Vries", kvkNumber: "1234567" });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ kvkNumber: "", vatId: "", contactPerson: "" });
  });

  it.each([
    ["kvkNumber", "9354108", "validation.kvkNumberInvalid"],
    ["vatId", "NL005025949057", "validation.vatNumberFormat"],
    ["contactPerson", "J".repeat(121), "customers.validation.contactPersonTooLong"],
  ])("rejects the company %s %j", (field, value, message) => {
    expect(messagesFor(parse({ [field]: value }))).toEqual([[field, message]]);
  });

  it.each([
    ["name", "S", "customers.validation.nameLength"],
    ["name", "S".repeat(201), "customers.validation.nameLength"],
    ["comment", "S".repeat(1001), "customers.validation.commentTooLong"],
    ["email", "info@", "validation.emailInvalid"],
    ["phone", "12345", "validation.phoneInvalid"],
  ])("rejects %s %j", (field, value, message) => {
    expect(messagesFor(parse({ [field]: value }))).toEqual([[field, message]]);
  });

  it("reports the company fields together with the other errors", () => {
    expect(messagesFor(parse({ name: "S", kvkNumber: "9354108" }))).toEqual([
      ["name", "customers.validation.nameLength"],
      ["kvkNumber", "validation.kvkNumberInvalid"],
    ]);
  });

  it("takes the address as a whole or not at all", () => {
    expect(parse({ address: emptyAddress }).success).toBe(true);
    expect(messagesFor(parse({ address: { ...emptyAddress, city: "Baarn" } }))).toEqual([
      ["address.street", "validation.streetLength"],
      ["address.houseNumber", "validation.houseNumberInvalid"],
      ["address.postcode", "validation.postcodeRequired"],
    ]);
  });

  it("checks the postcode by the Dutch rules only for the Netherlands", () => {
    expect(messagesFor(parse({ address: { ...address, postcode: "0123 AB" } }))).toEqual([
      ["address.postcode", "validation.postcodeNl"],
    ]);
    expect(parse({ address: { ...address, postcode: "B-1000", country: "BE" } }).success).toBe(
      true,
    );
  });
});

const contractor = {
  name: "Bouwbedrijf Jansen",
  legalForm: "BV",
  kvkNumber: "93541082",
  vatId: "",
  contactPerson: "",
  email: "",
  phone: "",
  address: emptyAddress,
  comment: "",
} as const;

describe("contractorFormSchema", () => {
  it("accepts a contractor with the name alone", () => {
    const result = contractorFormSchema.safeParse({
      ...contractor,
      legalForm: "",
      kvkNumber: "",
    });
    expect(result.success).toBe(true);
    expect(result.data?.legalForm).toBeUndefined();
  });

  it("checks the same formats as a company customer", () => {
    expect(
      messagesFor(contractorFormSchema.safeParse({ ...contractor, kvkNumber: "9354108" })),
    ).toEqual([["kvkNumber", "validation.kvkNumberInvalid"]]);
    expect(
      messagesFor(contractorFormSchema.safeParse({ ...contractor, legalForm: "GMBH" })),
    ).toEqual([["legalForm", "validation.optionInvalid"]]);
  });
});

describe("customer and contractor messages", () => {
  it("reports keys that exist in messages/ru.json", () => {
    const sections: Record<string, Record<string, string>> = {
      "customers.validation.": ru.customers.validation,
      "contractors.validation.": ru.contractors.validation,
      "validation.": ru.validation,
    };

    const reported = [
      ...messagesFor(
        parse({ name: "", kvkNumber: "1", vatId: "1", contactPerson: "J".repeat(121) }),
      ),
      ...messagesFor(parse({ type: "OTHER" as CustomerFormInput["type"] })),
      ...messagesFor(contractorFormSchema.safeParse({ ...contractor, name: "" })),
    ].map(([, message]) => message);

    expect(reported.length).toBeGreaterThan(0);
    expect(
      reported.filter((key) =>
        Object.entries(sections).every(
          ([prefix, section]) => !key.startsWith(prefix) || !(key.slice(prefix.length) in section),
        ),
      ),
    ).toEqual([]);
  });
});
