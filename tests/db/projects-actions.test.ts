import { describe, expect, it, vi } from "vitest";

import { createProject, updateProject } from "@/features/projects/actions";
import { projectFormValues } from "@/features/projects/form-values";
import { getProjectForEdit, suggestProjectNumber } from "@/features/projects/queries";
import type { ProjectFormInput } from "@/features/projects/schemas";
import type { AuditChange } from "@/lib/audit";
import { db } from "@/lib/db";
import { displayTodayIso } from "@/lib/format";

import { actAs, auditEntries, createUser, type TestUser } from "./helpers";
import { t } from "./translations";

const NBSP = "\u00A0";

const refused = { ok: false, error: "errors.forbiddenAction" };
const closed = { ok: false, error: "projects.errors.closed" };
const numberTaken = { ok: false, fieldErrors: { number: ["projects.errors.numberTaken"] } };
const customerArchived = {
  ok: false,
  fieldErrors: { customerId: ["projects.errors.customerArchived"] },
};

async function createCustomer(name: string, isActive = true) {
  const { id } = await db.customer.create({
    data: { type: "COMPANY", name, isActive },
    select: { id: true },
  });
  return id;
}

function projectInput(customerId: string, changes: Partial<ProjectFormInput> = {}) {
  return {
    number: "2026-001",
    name: "Renovatie kantoor",
    customerId,
    address: {
      street: "de Geerenweg",
      houseNumber: "4",
      houseNumberAddition: "e",
      postcode: "3741rs",
      city: "Baarn",
      country: "NL",
    },
    startDate: "2026-03-01",
    description: "",
    budgetAmount: "12 500,5",
    vatRate: "STANDARD_21",
    budgetHours: "1250,5",
    ...changes,
  } satisfies ProjectFormInput;
}

async function created(input: ProjectFormInput) {
  const result = await createProject(input);
  if (!result.ok) throw new Error(`The project was not created: ${JSON.stringify(result)}`);
  return result.id;
}

/** The values the edit form of a saved project submits unchanged. */
async function openForm(actor: TestUser, id: string): Promise<ProjectFormInput> {
  const project = await getProjectForEdit(actor, id);
  if (!project) throw new Error("The project is not there");
  return projectFormValues(project);
}

function changesOf(entry: { changes: unknown }) {
  return entry.changes as AuditChange[];
}

async function manager() {
  const user = await createUser({ role: "MANAGER" });
  await actAs(user);
  return user;
}

describe("createProject", () => {
  it("refuses an employee before looking at the data", async () => {
    await actAs(await createUser({ role: "EMPLOYEE" }));
    const parse = vi.spyOn(
      (await import("@/features/projects/schemas")).projectFormSchema,
      "safeParse",
    );

    await expect(createProject({})).resolves.toEqual(refused);
    await expect(createProject(projectInput(await createCustomer("Bakker")))).resolves.toEqual(
      refused,
    );

    expect(parse).not.toHaveBeenCalled();
    expect(await db.project.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
  });

  it("saves the budget as an exact Decimal and logs CREATE with readable values", async () => {
    await manager();
    const customerId = await createCustomer("Bakker Vastgoed B.V.");

    const id = await created(projectInput(customerId));

    const project = await db.project.findUniqueOrThrow({ where: { id } });
    expect(project.budgetAmount?.toFixed(2)).toBe("12500.50");
    expect(project.budgetHours?.toFixed(2)).toBe("1250.50");
    expect(project).toMatchObject({
      status: "IN_PROGRESS",
      postcode: "3741 RS",
      houseNumberAddition: "e",
      vatRate: "STANDARD_21",
    });
    expect(project.startDate.toISOString()).toBe("2026-03-01T00:00:00.000Z");

    const [entry] = await auditEntries();
    expect(entry).toMatchObject({
      action: "CREATE",
      entity: "Project",
      entityId: id,
      summary: t("audit.summaries.projectCreated", {
        number: "2026-001",
        name: "Renovatie kantoor",
      }),
    });
    expect(changesOf(entry)).toEqual(
      expect.arrayContaining([
        { field: "customer", before: null, after: "Bakker Vastgoed B.V." },
        { field: "address", before: null, after: "de Geerenweg 4 e, 3741 RS Baarn" },
        { field: "startDate", before: null, after: "01.03.2026" },
        { field: "budgetAmount", before: null, after: `12${NBSP}500,50${NBSP}€` },
        { field: "vatRate", before: null, after: "21 %" },
        { field: "budgetHours", before: null, after: `1${NBSP}250,5` },
        { field: "status", before: null, after: t("projects.statuses.IN_PROGRESS") },
      ]),
    );
    expect(entry.summary).not.toMatch(/12.?500/);
  });

  it("keeps every cent of the largest budget", async () => {
    await manager();
    const id = await created(
      projectInput(await createCustomer("Bakker"), { budgetAmount: "999.999.999.999,99" }),
    );
    const project = await db.project.findUniqueOrThrow({ where: { id } });
    expect(project.budgetAmount?.toFixed(2)).toBe("999999999999.99");
  });

  it("rejects a project without a customer, a full site address or a VAT rate", async () => {
    await manager();
    const result = await createProject(
      projectInput("", {
        address: { ...projectInput("").address, street: "", postcode: "" },
        vatRate: "",
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      fieldErrors: {
        customerId: ["projects.validation.customerRequired"],
        "address.street": ["validation.streetLength"],
        "address.postcode": ["validation.postcodeRequired"],
        vatRate: ["projects.validation.vatRateRequired"],
      },
    });
    expect(await db.project.count()).toBe(0);
  });

  it("refuses an archived customer, also when called directly", async () => {
    await manager();
    const archived = await createCustomer("Oud Klant", false);

    await expect(createProject(projectInput(archived))).resolves.toEqual(customerArchived);
    expect(await db.project.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
  });

  it("reports a taken number under the field, ignoring case; a deleted project frees its number", async () => {
    await manager();
    const customerId = await createCustomer("Bakker");
    const first = await created(projectInput(customerId, { number: "A-1" }));

    await expect(createProject(projectInput(customerId, { number: "a-1" }))).resolves.toEqual(
      numberTaken,
    );

    await db.project.update({ where: { id: first }, data: { deletedAt: new Date() } });
    await expect(createProject(projectInput(customerId, { number: "a-1" }))).resolves.toMatchObject(
      { ok: true },
    );
    expect(await db.auditLog.count()).toBe(2);
  });

  it("gives the second of two simultaneous creations with one number a field error", async () => {
    await manager();
    const customerId = await createCustomer("Bakker");

    const results = await Promise.all([
      createProject(projectInput(customerId, { name: "Eerste" })),
      createProject(projectInput(customerId, { name: "Tweede" })),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([numberTaken]);
    expect(await db.project.count()).toBe(1);
    expect(await db.auditLog.count()).toBe(1);
  });
});

describe("updateProject", () => {
  it("logs UPDATE with only the changed fields", async () => {
    const user = await manager();
    const id = await created(projectInput(await createCustomer("Bakker")));

    const result = await updateProject(id, {
      ...(await openForm(user, id)),
      name: "Renovatie kantoor en hal",
      budgetAmount: "13000",
    });

    expect(result).toEqual({ ok: true });
    const [, entry] = await auditEntries();
    expect(entry).toMatchObject({ action: "UPDATE", entity: "Project", entityId: id });
    expect(changesOf(entry)).toEqual([
      { field: "name", before: "Renovatie kantoor", after: "Renovatie kantoor en hal" },
      {
        field: "budgetAmount",
        before: `12${NBSP}500,50${NBSP}€`,
        after: `13${NBSP}000,00${NBSP}€`,
      },
    ]);
  });

  it("writes nothing when the form is saved unchanged, however the amount is typed", async () => {
    const user = await manager();
    const id = await created(projectInput(await createCustomer("Bakker")));
    const before = await db.project.findUniqueOrThrow({ where: { id } });

    await expect(updateProject(id, await openForm(user, id))).resolves.toEqual({ ok: true });
    await expect(
      updateProject(id, { ...(await openForm(user, id)), budgetAmount: "12500.50" }),
    ).resolves.toEqual({ ok: true });

    expect(await db.auditLog.count()).toBe(1);
    const after = await db.project.findUniqueOrThrow({ where: { id } });
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  it("keeps an archived customer of an old project but refuses to switch to one", async () => {
    const user = await manager();
    const customerId = await createCustomer("Bakker");
    const id = await created(projectInput(customerId));
    await db.customer.update({ where: { id: customerId }, data: { isActive: false } });

    await expect(
      updateProject(id, { ...(await openForm(user, id)), name: "Nieuwe naam" }),
    ).resolves.toEqual({ ok: true });

    const otherArchived = await createCustomer("Oud Klant", false);
    await expect(
      updateProject(id, { ...(await openForm(user, id)), customerId: otherArchived }),
    ).resolves.toEqual(customerArchived);
    expect((await db.project.findUniqueOrThrow({ where: { id } })).customerId).toBe(customerId);
  });

  it("refuses a closed project and writes nothing", async () => {
    const user = await manager();
    const id = await created(projectInput(await createCustomer("Bakker")));
    const form = await openForm(user, id);
    // Closed between opening the form and saving it.
    await db.project.update({
      where: { id },
      data: { status: "CLOSED", closedAt: new Date() },
    });

    await expect(updateProject(id, { ...form, name: "Te laat" })).resolves.toEqual(closed);
    await expect(updateProject(id, form)).resolves.toEqual(closed);

    expect((await db.project.findUniqueOrThrow({ where: { id } })).name).toBe("Renovatie kantoor");
    expect(await db.auditLog.count()).toBe(1);
  });

  it("reports a number taken by another project and refuses an employee", async () => {
    const user = await manager();
    const customerId = await createCustomer("Bakker");
    await created(projectInput(customerId, { number: "2026-001" }));
    const id = await created(
      projectInput(customerId, { number: "2026-002", name: "Nieuwbouw loods" }),
    );

    await expect(
      updateProject(id, { ...(await openForm(user, id)), number: "2026-001" }),
    ).resolves.toEqual(numberTaken);

    await actAs(await createUser({ role: "EMPLOYEE" }));
    await expect(updateProject(id, projectInput(customerId))).resolves.toEqual(refused);
  });
});

describe("suggestProjectNumber", () => {
  it("offers the next number of the current year, counting deleted projects", async () => {
    const user = await manager();
    const year = displayTodayIso().slice(0, 4);
    const customerId = await createCustomer("Bakker");

    expect(await suggestProjectNumber(user)).toBe(`${year}-001`);

    for (const number of [`${year}-009`, `${year}-012`, `${Number(year) - 1}-500`]) {
      await created(projectInput(customerId, { number, name: `Project ${number}` }));
    }
    await db.project.updateMany({
      where: { number: `${year}-012` },
      data: { deletedAt: new Date() },
    });

    expect(await suggestProjectNumber(user)).toBe(`${year}-013`);
  });
});
