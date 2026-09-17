import { describe, expect, it, vi } from "vitest";

import { saveCompanyProfile } from "@/features/company/actions";
import { companyFormValues } from "@/features/company/form-values";
import { getCompanyProfile } from "@/features/company/queries";
import type { CompanyFormInput } from "@/features/company/schemas";
import type { AuditChange } from "@/lib/audit";
import { db } from "@/lib/db";

import { actAs, auditEntries, createUser, type TestUser } from "./helpers";

const office = {
  street: "de Geerenweg",
  houseNumber: "4",
  houseNumberAddition: "E",
  postcode: "3741rs",
  city: "Baarn",
  country: "NL",
} as const;

const COMPANY: CompanyFormInput = {
  version: 0,
  legalName: "Smart Zaken B.V.",
  tradeName: "",
  legalForm: "BV",
  registeredOn: "2024-03-01",
  statutorySeat: "",
  kvkNumber: "93541082",
  establishmentNumber: "",
  rsin: "",
  vatId: "nl 0050.25949.b57",
  vatNumber: "",
  payrollTaxNumber: "",
  officeAddress: office,
  postalSameAsOffice: true,
  postalAddress: {
    isPostbus: false,
    street: "",
    houseNumber: "",
    houseNumberAddition: "",
    postbus: "",
    postcode: "",
    city: "",
    country: "NL",
  },
  warehouses: [
    {
      ...office,
      name: "Склад Роттердам",
      street: "Waalhaven",
      houseNumber: "12",
      city: "Rotterdam",
    },
    { ...office, name: "Склад Утрехт", street: "Kanaalweg", houseNumber: "7", city: "Utrecht" },
  ],
  email: "office@SmartZaken.nl",
  phone: "06 84 61 47 32",
  phones: [{ label: "Склад", number: "010 123 45 67" }],
  website: "www.SmartZaken.nl",
  socialLinks: [{ network: "LINKEDIN", url: "https://www.linkedin.com/company/smartzaken" }],
  activities: [
    { sbiCode: "4120", description: "Algemene burgerlijke en utiliteitsbouw", isMain: true },
    { sbiCode: "4399", description: "Overige gespecialiseerde bouw", isMain: false },
  ],
  activityDescription: "",
};

const refused = { ok: false, error: "errors.forbiddenAction" };
const concurrent = { ok: false, error: "settings.company.errors.concurrentUpdate" };

/** What the form of the saved profile opens with, as the dialog gets it. */
async function openForm(user: TestUser): Promise<CompanyFormInput> {
  return companyFormValues(await getCompanyProfile(user));
}

function changesOf(entry: { changes: unknown }) {
  return entry.changes as AuditChange[];
}

describe("saveCompanyProfile", () => {
  it("refuses an employee before looking at the data", async () => {
    await actAs(await createUser({ role: "EMPLOYEE" }));
    const parse = vi.spyOn(
      (await import("@/features/company/schemas")).companyFormSchema,
      "safeParse",
    );

    await expect(saveCompanyProfile({})).resolves.toEqual(refused);
    await expect(saveCompanyProfile(COMPANY)).resolves.toEqual(refused);

    expect(parse).not.toHaveBeenCalled();
    expect(await db.companyProfile.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
  });

  it("rejects invalid data called directly, with errors under the fields", async () => {
    await actAs(await createUser({ role: "MANAGER" }));

    const result = await saveCompanyProfile({
      ...COMPANY,
      legalName: "",
      kvkNumber: "9354108",
      vatId: "NL005025949057",
      rsin: "123456789",
      officeAddress: { ...office, postcode: "0123 AB" },
      website: "javascript:alert(1)",
      warehouses: [{ ...COMPANY.warehouses[0], postcode: "1234 SS" }],
    });

    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        legalName: ["settings.company.validation.legalNameLength"],
        kvkNumber: ["validation.kvkNumberInvalid"],
        rsin: ["settings.company.validation.rsinChecksum"],
        vatId: ["validation.vatNumberFormat"],
        "officeAddress.postcode": ["validation.postcodeNl"],
        "warehouses.0.postcode": ["validation.postcodeNl"],
        website: ["settings.company.validation.websiteInvalid"],
      },
    });
    expect(await db.companyProfile.count()).toBe(0);
  });

  it("creates the profile on the first save, normalised, and logs CREATE", async () => {
    const manager = await createUser({ role: "MANAGER" });
    await actAs(manager);

    await expect(saveCompanyProfile(COMPANY)).resolves.toEqual({ ok: true });

    const profile = await db.companyProfile.findUniqueOrThrow({
      where: { singleton: true },
      include: { addresses: true, phones: true, activities: true },
    });
    expect(profile).toMatchObject({
      version: 1,
      phone: "+31684614732",
      vatId: "NL005025949B57",
      createdById: manager.id,
      updatedById: manager.id,
    });
    expect(profile.addresses).toHaveLength(3);
    expect(profile.addresses.every((address) => address.createdById === manager.id)).toBe(true);
    expect(profile.addresses.find((address) => address.type === "OFFICE")?.postcode).toBe(
      "3741 RS",
    );

    const [entry] = await auditEntries();
    expect(entry).toMatchObject({
      action: "CREATE",
      entity: "CompanyProfile",
      entityId: profile.id,
      actorId: manager.id,
      summary: "Заполнены сведения о компании",
    });
    const changes = Object.fromEntries(changesOf(entry).map(({ field, after }) => [field, after]));
    expect(changes).toMatchObject({
      legalForm: "Общество с ограниченной ответственностью (bv)",
      registeredOn: "01.03.2024",
      officeAddress: "de Geerenweg 4 E, 3741 RS Baarn",
      postalSameAsOffice: "Да",
      warehouses:
        "Склад Роттердам: Waalhaven 12 E, 3741 RS Rotterdam; Склад Утрехт: Kanaalweg 7 E, 3741 RS Utrecht",
      phones: "Склад: +31101234567",
      activities:
        "4120 — Algemene burgerlijke en utiliteitsbouw (основной); 4399 — Overige gespecialiseerde bouw",
    });
    expect(Object.keys(changes)).not.toContain("tradeName");
    expect(JSON.stringify(entry.changes)).not.toMatch(/version|sortOrder|singleton|"id"/);
  });

  it("logs UPDATE with only the changed fields, readable before and after", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await actAs(admin);
    await saveCompanyProfile(COMPANY);
    const form = await openForm(admin);

    const result = await saveCompanyProfile({
      ...form,
      officeAddress: { ...form.officeAddress, country: "BE", postcode: "1000" },
      postalSameAsOffice: false,
      postalAddress: {
        ...form.postalAddress,
        isPostbus: true,
        postbus: "1234",
        postcode: "1000ab",
        city: "Amsterdam",
      },
    });

    expect(result).toEqual({ ok: true });
    const [, entry] = await auditEntries();
    expect(entry).toMatchObject({ action: "UPDATE", summary: "Изменены сведения о компании" });
    expect(changesOf(entry)).toEqual([
      {
        field: "officeAddress",
        before: "de Geerenweg 4 E, 3741 RS Baarn",
        after: "de Geerenweg 4 E, 1000 Baarn, Бельгия",
      },
      { field: "postalSameAsOffice", before: "Да", after: "Нет" },
      { field: "postalAddress", before: null, after: "Postbus 1234, 1000 AB Amsterdam" },
    ]);
    const profile = await db.companyProfile.findUniqueOrThrow({ where: { singleton: true } });
    expect(profile.version).toBe(2);
  });

  it("writes nothing and keeps the version when the form is unchanged", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await actAs(admin);
    await saveCompanyProfile(COMPANY);
    const before = await db.companyProfile.findUniqueOrThrow({ where: { singleton: true } });

    await expect(saveCompanyProfile(await openForm(admin))).resolves.toEqual({ ok: true });

    expect(await db.companyProfile.findUniqueOrThrow({ where: { singleton: true } })).toEqual(
      before,
    );
    expect(await db.auditLog.count()).toBe(1);
  });

  it("rejects a save from a stale version without overwriting the other one", async () => {
    const first = await createUser({ role: "ADMIN" });
    const second = await createUser({ role: "MANAGER" });
    await actAs(first);
    await saveCompanyProfile(COMPANY);
    const firstForm = await openForm(first);
    await actAs(second);
    const secondForm = await openForm(second);

    await actAs(first);
    await expect(saveCompanyProfile({ ...firstForm, legalName: "First B.V." })).resolves.toEqual({
      ok: true,
    });
    await actAs(second);
    await expect(saveCompanyProfile({ ...secondForm, legalName: "Second B.V." })).resolves.toEqual(
      concurrent,
    );

    const profile = await db.companyProfile.findUniqueOrThrow({ where: { singleton: true } });
    expect(profile).toMatchObject({ legalName: "First B.V.", version: 2, updatedById: first.id });
    expect(await db.auditLog.count()).toBe(2);
  });

  it("turns two simultaneous first saves into one profile and a concurrency error", async () => {
    await actAs(await createUser({ role: "ADMIN" }));

    const results = await Promise.all([saveCompanyProfile(COMPANY), saveCompanyProfile(COMPANY)]);

    expect(results).toEqual(expect.arrayContaining([{ ok: true }, concurrent]));
    expect(await db.companyProfile.count()).toBe(1);
    expect(await db.auditLog.count()).toBe(1);
  });

  it("updates addresses in place and soft-deletes a removed warehouse", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await actAs(admin);
    await saveCompanyProfile(COMPANY);
    const form = await openForm(admin);
    const [rotterdam, utrecht] = form.warehouses;

    await expect(
      saveCompanyProfile({
        ...form,
        warehouses: [{ ...utrecht, name: "Склад Утрехт-Noord" }],
        phones: [],
        activities: [{ ...form.activities[1], isMain: true }],
      }),
    ).resolves.toEqual({ ok: true });

    const addresses = await db.companyAddress.findMany({ where: { type: "WAREHOUSE" } });
    expect(addresses).toHaveLength(2);
    expect(addresses.find(({ id }) => id === rotterdam.id)?.deletedAt).toBeInstanceOf(Date);
    expect(addresses.find(({ id }) => id === utrecht.id)).toMatchObject({
      deletedAt: null,
      name: "Склад Утрехт-Noord",
      sortOrder: 0,
    });
    expect(await db.companyPhone.count()).toBe(0);
    expect(await db.companyActivity.findMany()).toMatchObject([{ sbiCode: "4399", isMain: true }]);
    expect(await openForm(admin)).toMatchObject({ warehouses: [{ id: utrecht.id }] });
  });

  it("saves a profile with only the name, and partly filled list rows as typed", async () => {
    const manager = await createUser({ role: "MANAGER" });
    await actAs(manager);
    const empty = companyFormValues(null);

    const result = await saveCompanyProfile({
      ...empty,
      legalName: "Smart Zaken B.V.",
      postalSameAsOffice: false,
      warehouses: [
        { ...empty.officeAddress, name: "" },
        { ...empty.officeAddress, name: "Склад Роттердам", city: "Rotterdam" },
      ],
      phones: [{ label: "Склад", number: "" }],
      socialLinks: [{ network: undefined, url: "https://www.linkedin.com/company/smartzaken" }],
      activities: [{ sbiCode: "", description: "Bouw", isMain: true }],
    });

    expect(result).toEqual({ ok: true });
    const profile = await db.companyProfile.findFirstOrThrow({
      include: { addresses: true, phones: true, socialLinks: true, activities: true },
    });
    expect(profile).toMatchObject({ legalForm: null, email: null, phone: null });
    expect(profile.addresses).toMatchObject([
      {
        type: "WAREHOUSE",
        name: "Склад Роттердам",
        city: "Rotterdam",
        postcode: null,
        houseNumber: null,
      },
    ]);
    expect(profile.phones).toMatchObject([{ label: "Склад", number: null }]);
    expect(profile.socialLinks).toMatchObject([{ network: null }]);
    expect(profile.activities).toMatchObject([
      { sbiCode: null, description: "Bouw", isMain: true },
    ]);

    const [entry] = await auditEntries();
    expect(changesOf(entry)).toEqual(
      expect.arrayContaining([
        { field: "warehouses", before: null, after: "Склад Роттердам: Rotterdam" },
        { field: "phones", before: null, after: "Склад" },
        { field: "activities", before: null, after: "Bouw (основной)" },
      ]),
    );
    expect(changesOf(entry).map(({ field }) => field)).not.toContain("officeAddress");

    // The saved profile opens and saves again without changes.
    await expect(saveCompanyProfile(await openForm(manager))).resolves.toEqual({ ok: true });
    expect(await db.auditLog.count()).toBe(1);
  });

  it("removes a cleared office address", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await actAs(admin);
    await saveCompanyProfile(COMPANY);
    const form = await openForm(admin);

    await expect(
      saveCompanyProfile({ ...form, officeAddress: companyFormValues(null).officeAddress }),
    ).resolves.toEqual({ ok: true });

    const office = await db.companyAddress.findFirstOrThrow({ where: { type: "OFFICE" } });
    expect(office.deletedAt).toBeInstanceOf(Date);
    const [, entry] = await auditEntries();
    expect(changesOf(entry)).toEqual([
      { field: "officeAddress", before: "de Geerenweg 4 E, 3741 RS Baarn", after: null },
    ]);
  });
});
