import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { companyDetailGroups, type DetailGroup } from "@/features/company/details";
import type { CompanyProfileRecord } from "@/features/company/form-values";
import messages from "../../messages/ru.json";

const translate = createTranslator({ locale: "ru", messages });
// Keys built at run time, as the application passes them.
const t = (key: string, values?: Record<string, string | number>) =>
  translate(key as never, values as never);

const stamp = new Date("2026-09-17T10:00:00Z");

type Address = CompanyProfileRecord["addresses"][number];

function profile(overrides: Partial<CompanyProfileRecord> = {}): CompanyProfileRecord {
  return {
    id: "profile",
    singleton: true,
    legalName: "Bouw B.V.",
    tradeName: null,
    legalForm: null,
    registeredOn: null,
    statutorySeat: null,
    kvkNumber: null,
    establishmentNumber: null,
    rsin: null,
    vatId: null,
    vatNumber: null,
    payrollTaxNumber: null,
    email: null,
    phone: null,
    website: null,
    activityDescription: null,
    postalSameAsOffice: true,
    version: 1,
    createdAt: stamp,
    updatedAt: stamp,
    createdById: null,
    updatedById: null,
    addresses: [],
    phones: [],
    socialLinks: [],
    activities: [],
    ...overrides,
  };
}

let addressCount = 0;

function address(type: Address["type"], parts: Partial<Address> = {}): Address {
  return {
    id: `address-${++addressCount}`,
    companyId: "profile",
    type,
    name: null,
    street: "de Geerenweg",
    houseNumber: 4,
    houseNumberAddition: "E",
    postbus: null,
    postcode: "3741 RS",
    city: "Baarn",
    country: "NL",
    sortOrder: 0,
    createdAt: stamp,
    updatedAt: stamp,
    createdById: null,
    updatedById: null,
    deletedAt: null,
    ...parts,
  };
}

const groups = (record: CompanyProfileRecord) => companyDetailGroups(record, t, "ru");
const group = (list: DetailGroup[], key: string) => list.find((item) => item.key === key);
const row = (item: DetailGroup | undefined, key: string) =>
  item?.rows.find((candidate) => candidate.key === key);

describe("companyDetailGroups", () => {
  it("shows only the main table, with empty values, for a profile with just a name", () => {
    const result = groups(profile());

    expect(result.map(({ key }) => key)).toEqual(["main"]);
    expect(result[0].rows.map(({ label }) => label)).toEqual([
      "Название компании",
      "Адрес",
      "Email",
      "Телефон",
      "Сайт",
      "Номер Торговой палаты",
      "Идентификационный номер НДС",
      "Номер НДС",
    ]);
    expect(result[0].rows.slice(1).every(({ value }) => value === null)).toBe(true);
  });

  it("links email and phone, and opens the website in a new tab with https:// added", () => {
    const main = group(
      groups(
        profile({ email: "Info@Bouw.nl", phone: "+31684614732", website: "www.SmartZaken.nl" }),
      ),
      "main",
    );

    expect(row(main, "email")?.value).toEqual({
      type: "link",
      text: "Info@Bouw.nl",
      href: "mailto:Info@Bouw.nl",
      external: false,
    });
    expect(row(main, "phone")?.value).toMatchObject({ href: "tel:+31684614732", external: false });
    expect(row(main, "website")?.value).toEqual({
      type: "link",
      text: "www.SmartZaken.nl",
      href: "https://www.smartzaken.nl/",
      external: true,
    });
  });

  it("keeps the scheme of a website and never links another scheme", () => {
    const linked = group(groups(profile({ website: "http://bouw.nl/over" })), "main");
    const unsafe = group(groups(profile({ website: "javascript:alert(1)" })), "main");

    expect(row(linked, "website")?.value).toMatchObject({ href: "http://bouw.nl/over" });
    expect(row(unsafe, "website")?.value).toEqual({ type: "text", text: "javascript:alert(1)" });
  });

  it("shows the legal form by name and the registration date as a calendar date", () => {
    const requisites = group(
      groups(profile({ legalForm: "BV", registeredOn: new Date("2020-03-01T00:00:00Z") })),
      "requisites",
    );

    expect(row(requisites, "legalForm")?.value).toEqual({
      type: "text",
      text: "Общество с ограниченной ответственностью (bv)",
    });
    expect(row(requisites, "registeredOn")?.value).toEqual({ type: "text", text: "01.03.2020" });
    expect(row(requisites, "rsin")?.value).toBeNull();
  });

  it("writes addresses in one line and the postal address as the same as the office", () => {
    const result = groups(
      profile({
        addresses: [
          address("OFFICE"),
          address("WAREHOUSE", { name: "Склад Антверпен", country: "BE", postcode: "2000" }),
          address("WAREHOUSE", { street: null, houseNumber: null, houseNumberAddition: null }),
        ],
      }),
    );

    expect(row(group(result, "main"), "officeAddress")?.value).toEqual({
      type: "text",
      text: "de Geerenweg 4 E, 3741 RS Baarn",
    });
    expect(
      group(result, "addresses")?.rows.map(({ label, value }) => [label, value?.text]),
    ).toEqual([
      ["Адрес офиса", "de Geerenweg 4 E, 3741 RS Baarn"],
      ["Почтовый адрес", "Совпадает с адресом офиса"],
      ["Склад Антверпен", "de Geerenweg 4 E, 2000 Baarn, Бельгия"],
      ["Склад 2", "3741 RS Baarn"],
    ]);
  });

  it("shows a PO box as the postal address", () => {
    const addresses = group(
      groups(
        profile({
          postalSameAsOffice: false,
          addresses: [
            address("POSTAL", {
              street: null,
              houseNumber: null,
              houseNumberAddition: null,
              postbus: "1234",
              postcode: "1000 AB",
              city: "Amsterdam",
            }),
          ],
        }),
      ),
      "addresses",
    );

    expect(row(addresses, "officeAddress")?.value).toBeNull();
    expect(row(addresses, "postalAddress")?.value).toEqual({
      type: "text",
      text: "Postbus 1234, 1000 AB Amsterdam",
    });
  });

  it("leaves out the addresses group when the postal address only repeats a missing office", () => {
    expect(group(groups(profile({ postalSameAsOffice: true })), "addresses")).toBeUndefined();
  });

  it("lists extra phones and social links with their labels", () => {
    const contacts = group(
      groups(
        profile({
          phones: [
            { label: "Склад", number: "+31201234567" },
            { label: null, number: null },
          ],
          socialLinks: [
            { network: "LINKEDIN", url: "https://www.linkedin.com/company/bouw" },
            { network: "OTHER", url: "https://bouw.social" },
          ],
        }),
      ),
      "contacts",
    );

    expect(contacts?.rows.map(({ label }) => label)).toEqual([
      "Склад",
      "Дополнительный телефон",
      "LinkedIn",
      "Социальная сеть",
    ]);
    expect(contacts?.rows[1].value).toBeNull();
    expect(contacts?.rows[2].value).toMatchObject({
      href: "https://www.linkedin.com/company/bouw",
      external: true,
    });
  });

  it("marks the main activity and ends the group with the activity description", () => {
    const activities = group(
      groups(
        profile({
          activities: [
            { sbiCode: "4120", description: "Burgerlijke en utiliteitsbouw", isMain: true },
            { sbiCode: "4399", description: null, isMain: false },
          ],
        }),
      ),
      "activities",
    );

    expect(activities?.rows.map(({ label, value, badge }) => [label, value, badge])).toEqual([
      ["4120", { type: "text", text: "Burgerlijke en utiliteitsbouw" }, "Основной"],
      ["4399", null, undefined],
      ["Описание деятельности", null, undefined],
    ]);
  });
});
