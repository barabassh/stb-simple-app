import type { z } from "zod";
import { describe, expect, it } from "vitest";

import { projectFormSchema, type ProjectFormInput } from "@/features/projects/schemas";
import { contractorLinkSchema } from "@/features/users/schemas";

import ru from "../../messages/ru.json";

const CUSTOMER_ID = "cm3qx8k2p0000abcd1234efgh";

const address = {
  street: "de Geerenweg",
  houseNumber: "4",
  houseNumberAddition: "E",
  postcode: "3741rs",
  city: "Baarn",
  country: "NL",
} as const;

const project: ProjectFormInput = {
  number: "2026-001",
  name: "Verbouwing Geerenweg",
  customerId: CUSTOMER_ID,
  address,
  startDate: "2026-09-17",
  description: "",
  budgetAmount: "",
  vatRate: "STANDARD_21",
  budgetHours: "",
};

const messagesFor = (result: z.ZodSafeParseResult<unknown>) =>
  result.success ? [] : result.error.issues.map((issue) => [issue.path.join("."), issue.message]);

const parse = (values: Partial<ProjectFormInput>) =>
  projectFormSchema.safeParse({ ...project, ...values });

describe("projectFormSchema", () => {
  it("normalises the address and reads the budget as an exact decimal", () => {
    const result = parse({ budgetAmount: "12 500,5", budgetHours: "1.250,75" });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      address: { postcode: "3741 RS", houseNumber: "4" },
      budgetAmount: "12500.50",
      vatRate: "STANDARD_21",
      budgetHours: "1250.75",
    });
  });

  it("drops the VAT rate of a project without a budget", () => {
    const result = parse({ budgetAmount: "", vatRate: "STANDARD_21" });
    expect(result.success).toBe(true);
    expect(result.data?.vatRate).toBeUndefined();
  });

  it("asks for the VAT rate of a budget", () => {
    expect(messagesFor(parse({ budgetAmount: "12500", vatRate: "" }))).toEqual([
      ["vatRate", "projects.validation.vatRateRequired"],
    ]);
  });

  it.each([
    ["-12500", "projects.validation.budgetAmountInvalid"],
    ["12500,505", "projects.validation.budgetAmountInvalid"],
    ["12.500", "projects.validation.budgetAmountInvalid"],
  ])("rejects the budget %j", (budgetAmount, message) => {
    expect(messagesFor(parse({ budgetAmount }))).toEqual([["budgetAmount", message]]);
  });

  it("rejects hours that are not a number", () => {
    expect(messagesFor(parse({ budgetHours: "8 часов" }))).toEqual([
      ["budgetHours", "projects.validation.budgetHoursInvalid"],
    ]);
  });

  it.each([
    ["number", "", "projects.validation.numberRequired"],
    ["number", "2026-00000000000000000001", "projects.validation.numberTooLong"],
    ["number", "2026 001", "projects.validation.numberFormat"],
    ["number", "Проект-1", "projects.validation.numberFormat"],
    ["name", "V", "projects.validation.nameLength"],
    ["customerId", "", "projects.validation.customerRequired"],
    ["startDate", "", "projects.validation.startDateRequired"],
    ["startDate", "17.09.2026", "validation.dateInvalid"],
    ["startDate", "2026-02-30", "validation.dateInvalid"],
    ["description", "S".repeat(2001), "projects.validation.descriptionTooLong"],
  ])("rejects %s %j", (field, value, message) => {
    expect(messagesFor(parse({ [field]: value }))).toEqual([[field, message]]);
  });

  it("accepts a start date in the future", () => {
    expect(parse({ startDate: "2030-01-01" }).success).toBe(true);
  });

  it("requires the whole site address", () => {
    expect(
      messagesFor(
        parse({
          address: { ...address, street: "", houseNumber: "", postcode: "", city: "" },
        }),
      ),
    ).toEqual([
      ["address.street", "validation.streetLength"],
      ["address.houseNumber", "validation.houseNumberInvalid"],
      ["address.postcode", "validation.postcodeRequired"],
      ["address.city", "validation.cityLength"],
    ]);
  });

  it("reports only keys that exist in messages/ru.json", () => {
    const sections: Record<string, Record<string, string>> = {
      "projects.validation.": ru.projects.validation,
      "validation.": ru.validation,
    };

    const reported = [
      ...messagesFor(
        parse({
          number: "",
          name: "",
          customerId: "",
          startDate: "17.09.2026",
          description: "S".repeat(2001),
          budgetAmount: "-1",
          budgetHours: "-1",
          address: { ...address, postcode: "0123 AB" },
        }),
      ),
      ...messagesFor(parse({ budgetAmount: "12500", vatRate: "" })),
    ].map(([, message]) => message);

    expect(reported.length).toBeGreaterThan(5);
    expect(
      reported.filter((key) =>
        Object.entries(sections).every(
          ([prefix, section]) => !key.startsWith(prefix) || !(key.slice(prefix.length) in section),
        ),
      ),
    ).toEqual([]);
  });
});

describe("contractorLinkSchema", () => {
  it("links an account with the contractor role", () => {
    expect(
      contractorLinkSchema.safeParse({ role: "CONTRACTOR", contractorId: CUSTOMER_ID }).success,
    ).toBe(true);
  });

  it.each(["ADMIN", "MANAGER", "EMPLOYEE"] as const)("leaves %s without a contractor", (role) => {
    expect(contractorLinkSchema.safeParse({ role, contractorId: "" }).success).toBe(true);
    expect(
      messagesFor(contractorLinkSchema.safeParse({ role, contractorId: CUSTOMER_ID })),
    ).toEqual([["contractorId", "users.validation.contractorRoleOnly"]]);
  });

  it("rejects a contractor that is not a record id", () => {
    expect(
      messagesFor(contractorLinkSchema.safeParse({ role: "CONTRACTOR", contractorId: "Jansen" })),
    ).toEqual([["contractorId", "users.validation.contractorInvalid"]]);
  });
});
