import { describe, expect, it, vi } from "vitest";

import { changeCustomerStatus, createCustomer, updateCustomer } from "@/features/customers/actions";
import { customerFormValues } from "@/features/customers/form-values";
import type { CustomerFormInput } from "@/features/customers/schemas";
import type { AuditChange } from "@/lib/audit";
import { db } from "@/lib/db";

import { actAs, auditEntries, createUser } from "./helpers";

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

const COMPANY: CustomerFormInput = {
  type: "COMPANY",
  name: "SmartZaken B.V.",
  kvkNumber: "9354 1082",
  vatId: "nl005025949b57",
  contactPerson: "Jan de Vries",
  email: "info@SmartZaken.nl",
  phone: "06 84 61 47 32",
  address,
  comment: "",
};

const refused = { ok: false, error: "errors.forbiddenAction" };

function changesOf(entry: { changes: unknown }) {
  return entry.changes as AuditChange[];
}

/** The values the edit form of a saved customer submits unchanged. */
async function openForm(id: string): Promise<CustomerFormInput> {
  return customerFormValues(await db.customer.findUniqueOrThrow({ where: { id } }));
}

async function createdCustomer(input: CustomerFormInput = COMPANY) {
  const result = await createCustomer(input);
  if (!result.ok) throw new Error(`The customer was not created: ${JSON.stringify(result)}`);
  return result.id;
}

describe("createCustomer", () => {
  it("refuses an employee before looking at the data", async () => {
    await actAs(await createUser({ role: "EMPLOYEE" }));
    const parse = vi.spyOn(
      (await import("@/features/customers/schemas")).customerFormSchema,
      "safeParse",
    );

    await expect(createCustomer({})).resolves.toEqual(refused);
    await expect(createCustomer(COMPANY)).resolves.toEqual(refused);

    expect(parse).not.toHaveBeenCalled();
    expect(await db.customer.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
  });

  it("rejects invalid data called directly, with errors under the fields", async () => {
    await actAs(await createUser({ role: "MANAGER" }));

    const result = await createCustomer({
      ...COMPANY,
      name: "S",
      kvkNumber: "9354108",
      vatId: "NL005025949057",
      address: { ...address, postcode: "0123 AB" },
    });

    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        name: ["customers.validation.nameLength"],
        kvkNumber: ["validation.kvkNumberInvalid"],
        vatId: ["validation.vatNumberFormat"],
        "address.postcode": ["validation.postcodeNl"],
      },
    });
    expect(await db.customer.count()).toBe(0);
  });

  it("saves a company normalised and logs CREATE with readable values", async () => {
    const manager = await createUser({ role: "MANAGER" });
    await actAs(manager);

    const id = await createdCustomer();

    const customer = await db.customer.findUniqueOrThrow({ where: { id } });
    expect(customer).toMatchObject({
      type: "COMPANY",
      kvkNumber: "93541082",
      vatId: "NL005025949B57",
      phone: "+31684614732",
      email: "info@SmartZaken.nl",
      postcode: "3741 RS",
      houseNumber: 4,
      isActive: true,
      createdById: manager.id,
      updatedById: manager.id,
    });

    const [entry] = await auditEntries();
    expect(entry).toMatchObject({
      action: "CREATE",
      entity: "Customer",
      entityId: id,
      actorId: manager.id,
      summary: "Создан заказчик «SmartZaken B.V.»",
    });
    expect(
      Object.fromEntries(changesOf(entry).map(({ field, after }) => [field, after])),
    ).toMatchObject({
      type: "Компания",
      address: "de Geerenweg 4 E, 3741 RS Baarn",
      isActive: "Активен",
    });
  });

  it("stores a private customer without the fields of a company", async () => {
    await actAs(await createUser({ role: "ADMIN" }));

    const id = await createdCustomer({ ...COMPANY, type: "PERSON", name: "Jan de Vries" });

    expect(await db.customer.findUniqueOrThrow({ where: { id } })).toMatchObject({
      type: "PERSON",
      kvkNumber: null,
      vatId: null,
      contactPerson: null,
      phone: "+31684614732",
    });
  });

  it("reports a KvK-nummer taken by another customer, archived ones included", async () => {
    await actAs(await createUser({ role: "ADMIN" }));
    const id = await createdCustomer();
    await changeCustomerStatus(id, false);

    const result = await createCustomer({ ...COMPANY, name: "Andere B.V." });

    expect(result).toEqual({
      ok: false,
      fieldErrors: { kvkNumber: ["customers.errors.kvkTaken"] },
    });
    expect(await db.customer.count()).toBe(1);
  });
});

describe("updateCustomer", () => {
  it("logs UPDATE with only the changed fields, readable before and after", async () => {
    await actAs(await createUser({ role: "MANAGER" }));
    const id = await createdCustomer();
    const form = await openForm(id);

    await expect(
      updateCustomer(id, { ...form, contactPerson: "Piet Bakker", address: emptyAddress }),
    ).resolves.toEqual({ ok: true });

    expect(await db.customer.findUniqueOrThrow({ where: { id } })).toMatchObject({
      contactPerson: "Piet Bakker",
      street: null,
      houseNumber: null,
      postcode: null,
      city: null,
      country: null,
    });

    const [, entry] = await auditEntries();
    expect(entry).toMatchObject({
      action: "UPDATE",
      entity: "Customer",
      summary: "Изменены данные заказчика «SmartZaken B.V.»",
    });
    expect(changesOf(entry)).toEqual([
      { field: "contactPerson", before: "Jan de Vries", after: "Piet Bakker" },
      { field: "address", before: "de Geerenweg 4 E, 3741 RS Baarn", after: null },
    ]);
  });

  it("clears the fields of a company when the customer becomes a private one", async () => {
    await actAs(await createUser({ role: "ADMIN" }));
    const id = await createdCustomer();
    const form = await openForm(id);

    await expect(
      updateCustomer(id, { ...form, type: "PERSON", name: "Jan de Vries" }),
    ).resolves.toEqual({ ok: true });

    expect(await db.customer.findUniqueOrThrow({ where: { id } })).toMatchObject({
      type: "PERSON",
      kvkNumber: null,
      vatId: null,
      contactPerson: null,
    });
  });

  it("writes nothing when the form is saved unchanged", async () => {
    await actAs(await createUser({ role: "ADMIN" }));
    const id = await createdCustomer();
    const { updatedAt } = await db.customer.findUniqueOrThrow({ where: { id } });

    await expect(updateCustomer(id, await openForm(id))).resolves.toEqual({ ok: true });

    expect((await db.customer.findUniqueOrThrow({ where: { id } })).updatedAt).toEqual(updatedAt);
    expect(await db.auditLog.count()).toBe(1);
  });

  it("refuses an employee and reports an unknown customer", async () => {
    await actAs(await createUser({ role: "ADMIN" }));
    const id = await createdCustomer();
    const form = await openForm(id);

    await actAs(await createUser({ role: "EMPLOYEE" }));
    await expect(updateCustomer(id, form)).resolves.toEqual(refused);

    await actAs(await createUser({ role: "MANAGER", login: "manager2" }));
    await expect(updateCustomer("not-a-cuid", form)).resolves.toEqual({
      ok: false,
      error: "customers.errors.notFound",
    });
  });
});

describe("changeCustomerStatus", () => {
  it("logs STATUS_CHANGE on the way to the archive and back", async () => {
    await actAs(await createUser({ role: "MANAGER" }));
    const id = await createdCustomer();

    await expect(changeCustomerStatus(id, false)).resolves.toEqual({ ok: true });
    await expect(changeCustomerStatus(id, true)).resolves.toEqual({ ok: true });

    const [, archived, restored] = await auditEntries();
    expect(archived).toMatchObject({
      action: "STATUS_CHANGE",
      entity: "Customer",
      entityId: id,
      summary: "Заказчик «SmartZaken B.V.» перенесён в архив",
    });
    expect(changesOf(archived)).toEqual([
      { field: "isActive", before: "Активен", after: "В архиве" },
    ]);
    expect(restored).toMatchObject({
      summary: "Заказчик «SmartZaken B.V.» восстановлен из архива",
    });
    expect((await db.customer.findUniqueOrThrow({ where: { id } })).isActive).toBe(true);
  });

  it("writes nothing when the customer is already archived", async () => {
    await actAs(await createUser({ role: "ADMIN" }));
    const id = await createdCustomer();
    await changeCustomerStatus(id, false);

    await expect(changeCustomerStatus(id, false)).resolves.toEqual({ ok: true });

    expect(await db.auditLog.count()).toBe(2);
  });

  it("refuses an employee", async () => {
    await actAs(await createUser({ role: "ADMIN" }));
    const id = await createdCustomer();

    await actAs(await createUser({ role: "EMPLOYEE" }));
    await expect(changeCustomerStatus(id, false)).resolves.toEqual(refused);

    expect((await db.customer.findUniqueOrThrow({ where: { id } })).isActive).toBe(true);
  });
});
