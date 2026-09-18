import { describe, expect, it, vi } from "vitest";

import {
  changeContractorStatus,
  createContractor,
  updateContractor,
} from "@/features/contractors/actions";
import { contractorFormValues } from "@/features/contractors/form-values";
import type { ContractorFormInput } from "@/features/contractors/schemas";
import type { AuditChange } from "@/lib/audit";
import { db } from "@/lib/db";

import { actAs, auditEntries, createUser } from "./helpers";

const CONTRACTOR: ContractorFormInput = {
  name: "Bouwbedrijf Jansen",
  legalForm: "EENMANSZAAK",
  kvkNumber: "9354 1082",
  vatId: "nl005025949b57",
  contactPerson: "Kees Jansen",
  email: "info@jansen.nl",
  phone: "06 84 61 47 32",
  address: {
    street: "Dorpsstraat",
    houseNumber: "12",
    houseNumberAddition: "",
    postcode: "3741rs",
    city: "Baarn",
    country: "NL",
  },
  comment: "",
};

const refused = { ok: false, error: "errors.forbiddenAction" };

function changesOf(entry: { changes: unknown }) {
  return entry.changes as AuditChange[];
}

async function openForm(id: string): Promise<ContractorFormInput> {
  return contractorFormValues(await db.contractor.findUniqueOrThrow({ where: { id } }));
}

async function createdContractor(input: ContractorFormInput = CONTRACTOR) {
  const result = await createContractor(input);
  if (!result.ok) throw new Error(`The contractor was not created: ${JSON.stringify(result)}`);
  return result.id;
}

describe("createContractor", () => {
  it("refuses an employee before looking at the data", async () => {
    await actAs(await createUser({ role: "EMPLOYEE" }));
    const parse = vi.spyOn(
      (await import("@/features/contractors/schemas")).contractorFormSchema,
      "safeParse",
    );

    await expect(createContractor(CONTRACTOR)).resolves.toEqual(refused);

    expect(parse).not.toHaveBeenCalled();
    expect(await db.contractor.count()).toBe(0);
  });

  it("rejects invalid data called directly, with errors under the fields", async () => {
    await actAs(await createUser({ role: "MANAGER" }));

    const result = await createContractor({
      ...CONTRACTOR,
      kvkNumber: "9354108",
      legalForm: "GMBH",
    } as unknown as ContractorFormInput);

    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        kvkNumber: ["validation.kvkNumberInvalid"],
        legalForm: ["validation.optionInvalid"],
      },
    });
    expect(await db.contractor.count()).toBe(0);
  });

  it("saves the contractor normalised and logs CREATE with readable values", async () => {
    const manager = await createUser({ role: "MANAGER" });
    await actAs(manager);

    const id = await createdContractor();

    expect(await db.contractor.findUniqueOrThrow({ where: { id } })).toMatchObject({
      legalForm: "EENMANSZAAK",
      kvkNumber: "93541082",
      vatId: "NL005025949B57",
      phone: "+31684614732",
      postcode: "3741 RS",
      isActive: true,
      createdById: manager.id,
    });
    const [entry] = await auditEntries();
    expect(entry).toMatchObject({
      action: "CREATE",
      entity: "Contractor",
      entityId: id,
      summary: "Создан подрядчик «Bouwbedrijf Jansen»",
    });
    expect(
      Object.fromEntries(changesOf(entry).map(({ field, after }) => [field, after])),
    ).toMatchObject({
      legalForm: "Индивидуальное предприятие (eenmanszaak)",
      address: "Dorpsstraat 12, 3741 RS Baarn",
      isActive: "Активен",
    });
  });

  it("reports a KvK-nummer taken by another contractor, archived ones included", async () => {
    await actAs(await createUser({ role: "ADMIN" }));
    await changeContractorStatus(await createdContractor(), false);

    await expect(createContractor({ ...CONTRACTOR, name: "Andere B.V." })).resolves.toEqual({
      ok: false,
      fieldErrors: { kvkNumber: ["contractors.errors.kvkTaken"] },
    });
  });
});

describe("updateContractor", () => {
  it("logs UPDATE with the changed fields and nothing for an unchanged form", async () => {
    await actAs(await createUser({ role: "ADMIN" }));
    const id = await createdContractor();

    await expect(updateContractor(id, await openForm(id))).resolves.toEqual({ ok: true });
    expect(await db.auditLog.count()).toBe(1);

    await expect(
      updateContractor(id, { ...(await openForm(id)), legalForm: "", contactPerson: "" }),
    ).resolves.toEqual({ ok: true });

    const [, entry] = await auditEntries();
    expect(entry).toMatchObject({ action: "UPDATE", entity: "Contractor" });
    expect(changesOf(entry)).toEqual([
      { field: "legalForm", before: "Индивидуальное предприятие (eenmanszaak)", after: null },
      { field: "contactPerson", before: "Kees Jansen", after: null },
    ]);
  });

  it("refuses an employee", async () => {
    await actAs(await createUser({ role: "ADMIN" }));
    const id = await createdContractor();
    const form = await openForm(id);

    await actAs(await createUser({ role: "EMPLOYEE" }));
    await expect(updateContractor(id, form)).resolves.toEqual(refused);
  });
});

describe("changeContractorStatus", () => {
  it("logs STATUS_CHANGE on the way to the archive and back, once per change", async () => {
    await actAs(await createUser({ role: "MANAGER" }));
    const id = await createdContractor();

    await expect(changeContractorStatus(id, false)).resolves.toEqual({ ok: true });
    await expect(changeContractorStatus(id, false)).resolves.toEqual({ ok: true });
    await expect(changeContractorStatus(id, true)).resolves.toEqual({ ok: true });

    const [, archived, restored, ...rest] = await auditEntries();
    expect(rest).toEqual([]);
    expect(archived).toMatchObject({
      action: "STATUS_CHANGE",
      entity: "Contractor",
      entityId: id,
      summary: "Подрядчик «Bouwbedrijf Jansen» перенесён в архив",
    });
    expect(changesOf(archived)).toEqual([
      { field: "isActive", before: "Активен", after: "В архиве" },
    ]);
    expect(restored).toMatchObject({
      summary: "Подрядчик «Bouwbedrijf Jansen» восстановлен из архива",
    });
  });

  it("refuses an employee", async () => {
    await actAs(await createUser({ role: "ADMIN" }));
    const id = await createdContractor();

    await actAs(await createUser({ role: "EMPLOYEE" }));
    await expect(changeContractorStatus(id, false)).resolves.toEqual(refused);
    expect((await db.contractor.findUniqueOrThrow({ where: { id } })).isActive).toBe(true);
  });
});
