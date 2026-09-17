import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { companyFormSchema, type CompanyFormInput } from "@/features/company/schemas";
import ru from "../../messages/ru.json";

const address = {
  street: "de Geerenweg",
  houseNumber: "4",
  houseNumberAddition: "E",
  postcode: "3741 RS",
  city: "Baarn",
  country: "NL",
} as const;

const emptyAddress = {
  street: "",
  houseNumber: "",
  houseNumberAddition: "",
  postcode: "",
  city: "",
  country: "NL",
} as const;

const emptyPostalAddress = {
  isPostbus: false,
  street: "",
  houseNumber: "",
  houseNumberAddition: "",
  postbus: "",
  postcode: "",
  city: "",
  country: "NL",
};

const minimalCompany: CompanyFormInput = {
  version: 0,
  legalName: "SmartZaken B.V.",
  tradeName: "",
  legalForm: "BV",
  registeredOn: "",
  statutorySeat: "",
  kvkNumber: "",
  establishmentNumber: "",
  rsin: "",
  vatId: "",
  vatNumber: "",
  payrollTaxNumber: "",
  officeAddress: address,
  postalSameAsOffice: true,
  postalAddress: emptyPostalAddress,
  warehouses: [],
  email: "info@SmartZaken.nl",
  phone: "035 541 23 45",
  phones: [],
  website: "",
  socialLinks: [],
  activities: [],
  activityDescription: "",
};

function parse(overrides: Partial<CompanyFormInput>) {
  return companyFormSchema.safeParse({ ...minimalCompany, ...overrides });
}

const reportedMessages = new Set<string>();

function messagesFor(result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return result.error?.issues.map((issue) => {
    reportedMessages.add(issue.message);
    return [issue.path.join("."), issue.message];
  });
}

const activity = (sbiCode: string, isMain = false) => ({
  sbiCode,
  description: "Bouw",
  isMain,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-17T09:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("companyFormSchema: required fields", () => {
  it("accepts the required fields alone", () => {
    expect(parse({}).success).toBe(true);
  });

  it("gives the same result when its own output is parsed again", () => {
    const parsed = companyFormSchema.parse({
      ...minimalCompany,
      kvkNumber: "1234 5678",
      vatId: "nl 0050.25949.b57",
      officeAddress: { ...address, postcode: "3741rs", houseNumber: "004" },
      phones: [{ label: " Склад ", number: "0031 6 84614732" }],
    });

    expect(companyFormSchema.parse(parsed)).toEqual(parsed);
  });

  it("requires only the company name", () => {
    const onlyName = {
      ...minimalCompany,
      legalForm: undefined,
      officeAddress: emptyAddress,
      email: "",
      phone: "",
      postalSameAsOffice: false,
    };

    expect(companyFormSchema.safeParse(onlyName).success).toBe(true);
    expect(messagesFor(companyFormSchema.safeParse({ ...onlyName, legalName: "" }))).toEqual([
      ["legalName", "settings.company.validation.legalNameLength"],
    ]);
  });

  it("rejects a legal form that is not in the list", () => {
    expect(messagesFor(parse({ legalForm: "LTD" } as never))).toEqual([
      ["legalForm", "settings.company.validation.optionInvalid"],
    ]);
  });

  it("requires the rest of an office or postal address once it is started", () => {
    const started = { ...address, street: "", houseNumber: "", postcode: "", city: "Baarn" };
    const postalAddress = { ...emptyPostalAddress, ...started };

    expect(
      messagesFor(parse({ officeAddress: started, postalSameAsOffice: false, postalAddress })),
    ).toEqual([
      ["officeAddress.street", "settings.company.validation.streetLength"],
      ["officeAddress.houseNumber", "settings.company.validation.houseNumberInvalid"],
      ["officeAddress.postcode", "settings.company.validation.postcodeRequired"],
      ["postalAddress.street", "settings.company.validation.streetLength"],
      ["postalAddress.houseNumber", "settings.company.validation.houseNumberInvalid"],
      ["postalAddress.postcode", "settings.company.validation.postcodeRequired"],
    ]);
  });

  it("keeps the email as typed", () => {
    expect(companyFormSchema.parse(minimalCompany).email).toBe("info@SmartZaken.nl");
  });

  it.each([
    ["S", "legalName", "legalNameLength"],
    ["S".repeat(201), "legalName", "legalNameLength"],
    ["S".repeat(201), "tradeName", "tradeNameTooLong"],
    ["S".repeat(101), "statutorySeat", "statutorySeatTooLong"],
    ["S".repeat(1001), "activityDescription", "activityDescriptionTooLong"],
  ])("limits the length of %j in %s", (value, field, key) => {
    expect(messagesFor(parse({ [field]: value }))).toEqual([
      [field, `settings.company.validation.${key}`],
    ]);
  });
});

describe("companyFormSchema: registration date", () => {
  it("accepts today in Kyiv", () => {
    expect(parse({ registeredOn: "2026-09-17" }).success).toBe(true);
  });

  it.each([
    ["2026-09-18", "registeredOnInFuture"],
    ["2026-02-30", "dateInvalid"],
    ["17.09.2026", "dateInvalid"],
  ])("rejects %j", (registeredOn, key) => {
    expect(messagesFor(parse({ registeredOn }))).toEqual([
      ["registeredOn", `settings.company.validation.${key}`],
    ]);
  });
});

describe("companyFormSchema: registration and tax numbers", () => {
  it("stores the numbers without separators and in upper case", () => {
    const parsed = companyFormSchema.parse({
      ...minimalCompany,
      kvkNumber: "1234 5678",
      establishmentNumber: "0000.1234.5678",
      rsin: "111 222 333",
      vatId: "nl 0050.25949.b57",
      vatNumber: "NL005025949B57",
      payrollTaxNumber: "123456789l01",
    });

    expect(parsed).toMatchObject({
      kvkNumber: "12345678",
      establishmentNumber: "000012345678",
      rsin: "111222333",
      vatId: "NL005025949B57",
      vatNumber: "NL005025949B57",
      payrollTaxNumber: "123456789L01",
    });
  });

  it.each([
    ["kvkNumber", "1234567", "kvkNumberInvalid"],
    ["establishmentNumber", "12345678901", "establishmentNumberInvalid"],
    ["rsin", "11122233", "rsinFormat"],
    ["rsin", "111222334", "rsinChecksum"],
    ["vatId", "NL005025949057", "vatNumberFormat"],
    ["vatNumber", "NL00502594B57", "vatNumberFormat"],
    ["payrollTaxNumber", "123456789B01", "payrollTaxNumberFormat"],
  ])("rejects %s %j with one message", (field, value, key) => {
    expect(messagesFor(parse({ [field]: value }))).toEqual([
      [field, `settings.company.validation.${key}`],
    ]);
  });
});

describe("companyFormSchema: addresses", () => {
  it("normalizes a Dutch postcode and the house number", () => {
    const parsed = companyFormSchema.parse({
      ...minimalCompany,
      officeAddress: { ...address, postcode: "3741rs", houseNumber: "04" },
    });

    expect(parsed.officeAddress).toMatchObject({ postcode: "3741 RS", houseNumber: "4" });
  });

  it.each(["0123 AB", "1234 SS", "12345"])("rejects the Dutch postcode %j", (postcode) => {
    expect(messagesFor(parse({ officeAddress: { ...address, postcode } }))).toEqual([
      ["officeAddress.postcode", "settings.company.validation.postcodeNl"],
    ]);
  });

  it("checks a postcode by the Dutch rules only for the Netherlands", () => {
    expect(parse({ officeAddress: { ...address, postcode: "12345", country: "DE" } }).success).toBe(
      true,
    );
    expect(
      messagesFor(parse({ officeAddress: { ...address, postcode: "1", country: "DE" } })),
    ).toEqual([["officeAddress.postcode", "settings.company.validation.postcodeForeign"]]);
    expect(
      messagesFor(parse({ officeAddress: { ...address, postcode: "12_45", country: "DE" } })),
    ).toEqual([["officeAddress.postcode", "settings.company.validation.postcodeForeign"]]);
  });

  it.each([
    ["houseNumber", "0", "houseNumberInvalid"],
    ["houseNumber", "100000", "houseNumberInvalid"],
    ["houseNumber", "4a", "houseNumberInvalid"],
    ["houseNumberAddition", "2-hoog bis!", "houseNumberAdditionInvalid"],
    ["street", "S".repeat(101), "streetLength"],
    ["city", "S".repeat(81), "cityLength"],
    ["country", "US", "countryRequired"],
  ])("rejects the office %s %j", (field, value, key) => {
    expect(messagesFor(parse({ officeAddress: { ...address, [field]: value } }))).toEqual([
      [`officeAddress.${field}`, `settings.company.validation.${key}`],
    ]);
  });

  it("ignores the postal address fields while it is the same as the office", () => {
    const postalAddress = { ...emptyPostalAddress, postcode: "0000", country: "" };

    expect(parse({ postalSameAsOffice: true, postalAddress }).success).toBe(true);
  });

  it("accepts a separate postal street address", () => {
    const postalAddress = {
      ...emptyPostalAddress,
      ...address,
      houseNumber: "04",
      postcode: "1000ab",
    };
    const parsed = companyFormSchema.parse({
      ...minimalCompany,
      postalSameAsOffice: false,
      postalAddress,
    });

    expect(parsed.postalAddress).toMatchObject({ houseNumber: "4", postcode: "1000 AB" });
  });

  it("accepts a PO box without a street", () => {
    const postalAddress = {
      ...emptyPostalAddress,
      isPostbus: true,
      postbus: "1234",
      postcode: "1000 AB",
      city: "Amsterdam",
    };

    expect(parse({ postalSameAsOffice: false, postalAddress }).success).toBe(true);
  });

  it("requires the PO box number and postcode of a started PO box", () => {
    const postalAddress = {
      ...emptyPostalAddress,
      isPostbus: true,
      street: "ignored",
      city: "Amsterdam",
    };

    expect(messagesFor(parse({ postalSameAsOffice: false, postalAddress }))).toEqual([
      ["postalAddress.postbus", "settings.company.validation.postbusInvalid"],
      ["postalAddress.postcode", "settings.company.validation.postcodeRequired"],
    ]);
  });

  it("accepts an empty postal address that differs from the office", () => {
    const postalAddress = { ...emptyPostalAddress, isPostbus: true, street: "ignored" };

    expect(parse({ postalSameAsOffice: false, postalAddress }).success).toBe(true);
  });

  it("keeps a partly filled warehouse and drops blank ones", () => {
    const blank = { ...emptyAddress, name: "" };
    const parsed = companyFormSchema.parse({
      ...minimalCompany,
      warehouses: [blank, { ...blank, name: "Rotterdam", city: "Rotterdam" }, blank],
    });

    expect(parsed.warehouses).toMatchObject([{ name: "Rotterdam", city: "Rotterdam", street: "" }]);
  });

  it("checks the postal postcode against its own country", () => {
    const postalAddress = {
      ...emptyPostalAddress,
      isPostbus: true,
      postbus: "12",
      postcode: "1234 SA",
      city: "Amsterdam",
    };

    expect(messagesFor(parse({ postalSameAsOffice: false, postalAddress }))).toEqual([
      ["postalAddress.postcode", "settings.company.validation.postcodeNl"],
    ]);
  });

  it("accepts up to 10 warehouses with optional names", () => {
    const warehouses = Array.from({ length: 10 }, (_, i) => ({
      ...address,
      name: i ? "" : "Rotterdam",
    }));

    expect(parse({ warehouses }).success).toBe(true);
    expect(messagesFor(parse({ warehouses: [...warehouses, { ...address, name: "" }] }))).toEqual([
      ["warehouses", "settings.company.validation.warehousesTooMany"],
    ]);
  });

  it("validates each warehouse as an address", () => {
    const warehouses = [{ ...address, name: "S".repeat(101), postcode: "0123 AB" }];

    expect(messagesFor(parse({ warehouses }))).toEqual([
      ["warehouses.0.name", "settings.company.validation.warehouseNameTooLong"],
      ["warehouses.0.postcode", "settings.company.validation.postcodeNl"],
    ]);
  });
});

describe("companyFormSchema: contacts", () => {
  it.each([
    ["06 84 61 47 32", "+31684614732"],
    ["0031 6 84614732", "+31684614732"],
    ["+31684614732", "+31684614732"],
  ])("stores the phone %j as %j", (phone, stored) => {
    expect(companyFormSchema.parse({ ...minimalCompany, phone }).phone).toBe(stored);
  });

  it("rejects an invalid main phone", () => {
    expect(messagesFor(parse({ phone: "06 123" }))).toEqual([
      ["phone", "settings.company.validation.phoneInvalid"],
    ]);
  });

  it("rejects an invalid email", () => {
    expect(messagesFor(parse({ email: "info@" }))).toEqual([
      ["email", "settings.company.validation.emailInvalid"],
    ]);
  });

  it("accepts up to 5 additional phones and checks each", () => {
    const phones = Array.from({ length: 5 }, () => ({ label: "Склад", number: "06 84614732" }));

    expect(parse({ phones }).success).toBe(true);
    expect(messagesFor(parse({ phones: [...phones, phones[0]] }))).toEqual([
      ["phones", "settings.company.validation.phonesTooMany"],
    ]);
    expect(messagesFor(parse({ phones: [{ label: "S".repeat(51), number: "06 123" }] }))).toEqual([
      ["phones.0.label", "settings.company.validation.phoneLabelTooLong"],
      ["phones.0.number", "settings.company.validation.phoneInvalid"],
    ]);
  });

  it("keeps a phone row with only a label and drops blank rows", () => {
    const phones = [
      { label: "", number: "" },
      { label: "Склад", number: "" },
    ];

    expect(companyFormSchema.parse({ ...minimalCompany, phones }).phones).toEqual([
      { label: "Склад", number: "" },
    ]);
  });

  it("keeps the website as typed", () => {
    expect(
      companyFormSchema.parse({ ...minimalCompany, website: "www.SmartZaken.nl" }).website,
    ).toBe("www.SmartZaken.nl");
  });

  it.each(["javascript:alert(1)", "ftp://smartzaken.nl"])("rejects the website %j", (website) => {
    expect(messagesFor(parse({ website }))).toEqual([
      ["website", "settings.company.validation.websiteInvalid"],
    ]);
  });

  it("accepts up to 10 https social links", () => {
    const socialLinks = Array.from({ length: 10 }, () => ({
      network: "LINKEDIN" as const,
      url: "https://www.linkedin.com/company/smartzaken",
    }));

    expect(parse({ socialLinks }).success).toBe(true);
    expect(messagesFor(parse({ socialLinks: [...socialLinks, socialLinks[0]] }))).toEqual([
      ["socialLinks", "settings.company.validation.socialLinksTooMany"],
    ]);
  });

  it("rejects a social link that is not https or has an unknown network", () => {
    const socialLinks = [{ network: "MYSPACE", url: "http://facebook.com/smartzaken" }];

    expect(messagesFor(parse({ socialLinks } as never))).toEqual([
      ["socialLinks.0.network", "settings.company.validation.optionInvalid"],
      ["socialLinks.0.url", "settings.company.validation.socialLinkInvalid"],
    ]);
  });

  it("keeps a social link without a network and drops blank rows", () => {
    const socialLinks = [
      { network: "", url: "" },
      { network: "", url: "https://www.linkedin.com/company/smartzaken" },
    ];

    expect(companyFormSchema.parse({ ...minimalCompany, socialLinks }).socialLinks).toEqual([
      { url: "https://www.linkedin.com/company/smartzaken" },
    ]);
  });
});

describe("companyFormSchema: activities", () => {
  it("accepts a list with exactly one main activity", () => {
    expect(parse({ activities: [activity("4120", true), activity("43221")] }).success).toBe(true);
  });

  it("requires a main activity in a non-empty list", () => {
    expect(messagesFor(parse({ activities: [activity("4120"), activity("43221")] }))).toEqual([
      ["activities", "settings.company.validation.mainActivityRequired"],
    ]);
  });

  it("allows only one main activity", () => {
    expect(
      messagesFor(parse({ activities: [activity("4120", true), activity("43221", true)] })),
    ).toEqual([["activities", "settings.company.validation.mainActivityNotUnique"]]);
  });

  it("drops blank activities before checking the main one", () => {
    const blankMain = { sbiCode: "", description: "", isMain: true };

    expect(
      companyFormSchema.parse({ ...minimalCompany, activities: [blankMain] }).activities,
    ).toEqual([]);
    expect(messagesFor(parse({ activities: [blankMain, activity("4120")] }))).toEqual([
      ["activities", "settings.company.validation.mainActivityRequired"],
    ]);
    const described = { sbiCode: "", description: "Bouw", isMain: true };
    expect(
      companyFormSchema.parse({ ...minimalCompany, activities: [described] }).activities,
    ).toEqual([described]);
  });

  it("rejects a repeated SBI code at the repetition", () => {
    const activities = [activity("4120", true), activity("43221"), activity(" 4120 ")];

    expect(messagesFor(parse({ activities }))).toEqual([
      ["activities.2.sbiCode", "settings.company.validation.sbiCodeDuplicate"],
    ]);
  });

  it.each(["412", "412001", "41.20"])("rejects the SBI code %j", (sbiCode) => {
    expect(messagesFor(parse({ activities: [activity(sbiCode, true)] }))).toEqual([
      ["activities.0.sbiCode", "settings.company.validation.sbiCodeInvalid"],
    ]);
  });

  it("allows 20 activities and no more", () => {
    const activities = Array.from({ length: 20 }, (_, i) => activity(String(4100 + i), i === 0));

    expect(parse({ activities }).success).toBe(true);
    expect(messagesFor(parse({ activities: [...activities, activity("9999")] }))).toEqual([
      ["activities", "settings.company.validation.activitiesTooMany"],
    ]);
  });
});

// Runs last: the tests above collect every message the schema reported.
describe("companyFormSchema: messages", () => {
  it("reports only translation keys that exist in messages/ru.json", () => {
    const prefix = "settings.company.validation.";
    const validation: Record<string, string> = ru.settings.company.validation;
    const missing = [...reportedMessages].filter(
      (key) => !key.startsWith(prefix) || !(key.slice(prefix.length) in validation),
    );

    expect(reportedMessages.size).toBeGreaterThan(30);
    expect(missing).toEqual([]);
  });
});
