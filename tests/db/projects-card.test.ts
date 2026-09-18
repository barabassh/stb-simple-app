import { describe, expect, it } from "vitest";

import { listAuditLogs, listEntityAuditLogs } from "@/features/audit/queries";
import {
  changeProjectStatus,
  createProject,
  deleteProject,
  updateProject,
} from "@/features/projects/actions";
import { projectFormValues } from "@/features/projects/form-values";
import { getProject, getProjectForEdit } from "@/features/projects/queries";
import type { ProjectFormInput } from "@/features/projects/schemas";
import { db } from "@/lib/db";

import { actAs, auditEntries, createUser, type TestUser } from "./helpers";
import { t } from "./translations";

const NBSP = "\u00A0";

const refused = { ok: false, error: "errors.forbiddenAction" };
const closed = { ok: false, error: "projects.errors.closed" };
const statusChanged = { ok: false, error: "projects.errors.statusChanged" };
const notFound = { ok: false, error: "projects.errors.notFound" };

const historyTable = { page: 1, pageSize: 25, sort: null } as const;
const withheldBudget = { field: "budget", before: null, after: null, withheld: true };

async function createCustomer(name = "Bakker Vastgoed B.V.") {
  const { id } = await db.customer.create({
    data: { type: "COMPANY", name },
    select: { id: true },
  });
  return id;
}

function projectInput(customerId: string, number = "2026-001"): ProjectFormInput {
  return {
    number,
    name: "Renovatie kantoor",
    customerId,
    address: {
      street: "de Geerenweg",
      houseNumber: "4",
      houseNumberAddition: "",
      postcode: "3741 RS",
      city: "Baarn",
      country: "NL",
    },
    startDate: "2026-03-01",
    description: "",
    budgetAmount: "12500,5",
    vatRate: "STANDARD_21",
    budgetHours: "1250",
  };
}

/** A project in progress, created through the action by this user, who goes on acting. */
async function createdBy(actor: TestUser, number?: string) {
  await actAs(actor);
  const result = await createProject(projectInput(await createCustomer(), number));
  if (!result.ok) throw new Error(`The project was not created: ${JSON.stringify(result)}`);
  return result.id;
}

async function openForm(actor: TestUser, id: string): Promise<ProjectFormInput> {
  const project = await getProjectForEdit(actor, id);
  if (!project) throw new Error("The project is not there");
  return projectFormValues(project);
}

function projectRow(id: string) {
  return db.project.findUniqueOrThrow({ where: { id } });
}

describe("changeProjectStatus", () => {
  it("closes and reopens a project, filling and clearing the closing stamp", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const id = await createdBy(manager);

    await expect(changeProjectStatus(id, "CLOSED")).resolves.toEqual({ ok: true });
    const closedRow = await projectRow(id);
    expect(closedRow).toMatchObject({ status: "CLOSED", closedById: manager.id });
    expect(closedRow.closedAt).toBeInstanceOf(Date);

    await expect(changeProjectStatus(id, "IN_PROGRESS")).resolves.toEqual({ ok: true });
    expect(await projectRow(id)).toMatchObject({
      status: "IN_PROGRESS",
      closedAt: null,
      closedById: null,
    });

    const [, closing, reopening] = await auditEntries();
    expect(closing).toMatchObject({
      action: "STATUS_CHANGE",
      entity: "Project",
      entityId: id,
      actorId: manager.id,
      summary: t("audit.summaries.projectClosed", { number: "2026-001" }),
      changes: [{ field: "status", before: "В работе", after: "Закрыт" }],
    });
    expect(reopening).toMatchObject({
      action: "STATUS_CHANGE",
      summary: t("audit.summaries.projectReopened", { number: "2026-001" }),
      changes: [{ field: "status", before: "Закрыт", after: "В работе" }],
    });
  });

  it("writes nothing when the status has already changed, e.g. in another tab", async () => {
    const id = await createdBy(await createUser({ role: "ADMIN" }));
    await changeProjectStatus(id, "CLOSED");
    const { closedAt } = await projectRow(id);

    await expect(changeProjectStatus(id, "CLOSED")).resolves.toEqual(statusChanged);

    expect((await projectRow(id)).closedAt).toEqual(closedAt);
    expect(await db.auditLog.count()).toBe(2);
  });

  it("closes a project once when two requests come at the same time", async () => {
    const id = await createdBy(await createUser({ role: "MANAGER" }));

    const results = await Promise.all([
      changeProjectStatus(id, "CLOSED"),
      changeProjectStatus(id, "CLOSED"),
    ]);

    expect(results).toContainEqual({ ok: true });
    expect(results).toContainEqual(statusChanged);
    expect(await db.auditLog.count({ where: { action: "STATUS_CHANGE" } })).toBe(1);
  });

  it("makes a form opened before the closing fail with the closed message", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const id = await createdBy(manager);
    const form = await openForm(manager, id);

    await changeProjectStatus(id, "CLOSED");

    await expect(updateProject(id, { ...form, name: "Te laat" })).resolves.toEqual(closed);
    expect((await projectRow(id)).name).toBe("Renovatie kantoor");
    expect(await db.auditLog.count({ where: { action: "UPDATE" } })).toBe(0);
  });

  it("refuses an employee and answers for a deleted project that it is not found", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const deleted = await createdBy(admin, "2026-001");
    const open = await createProject(projectInput(await createCustomer(), "2026-002"));
    if (!open.ok) throw new Error("The project was not created");
    await deleteProject(deleted);

    await expect(changeProjectStatus(deleted, "CLOSED")).resolves.toEqual(notFound);

    await actAs(await createUser({ role: "EMPLOYEE" }));
    await expect(changeProjectStatus(open.id, "CLOSED")).resolves.toEqual(refused);
    expect((await projectRow(open.id)).status).toBe("IN_PROGRESS");
  });
});

describe("deleteProject", () => {
  it("lets an administrator delete a project in progress and frees its number", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const id = await createdBy(admin);

    await expect(deleteProject(id)).resolves.toEqual({ ok: true });

    expect((await projectRow(id)).deletedAt).toBeInstanceOf(Date);
    expect(await getProject(admin, id)).toBeNull();
    expect((await auditEntries()).at(-1)).toMatchObject({
      action: "DELETE",
      entity: "Project",
      entityId: id,
      summary: t("audit.summaries.projectDeleted", { number: "2026-001" }),
      changes: null,
    });

    await expect(createProject(projectInput(await createCustomer()))).resolves.toMatchObject({
      ok: true,
    });
    await expect(deleteProject(id)).resolves.toEqual(notFound);
  });

  it("refuses a manager", async () => {
    const id = await createdBy(await createUser({ role: "MANAGER" }));

    await expect(deleteProject(id)).resolves.toEqual(refused);

    expect((await projectRow(id)).deletedAt).toBeNull();
    expect(await db.auditLog.count({ where: { action: "DELETE" } })).toBe(0);
  });

  it("does not delete a closed project", async () => {
    const id = await createdBy(await createUser({ role: "ADMIN" }));
    await changeProjectStatus(id, "CLOSED");

    await expect(deleteProject(id)).resolves.toEqual(closed);

    expect((await projectRow(id)).deletedAt).toBeNull();
    expect(await db.auditLog.count({ where: { action: "DELETE" } })).toBe(0);
  });
});

describe("getProject", () => {
  it("gives a contractor a project in progress with the contractor's fields only", async () => {
    const id = await createdBy(await createUser({ role: "MANAGER" }));

    const project = await getProject(await createUser({ role: "CONTRACTOR" }), id);

    expect(Object.keys(project ?? {}).sort()).toEqual(
      ["address", "duration", "id", "name", "number", "startDate"].sort(),
    );
  });

  it("does not show a contractor a closed project, nor anybody a deleted one", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const closedId = await createdBy(admin, "2026-001");
    await changeProjectStatus(closedId, "CLOSED");
    const deletedId = await createdBy(admin, "2026-002");
    await deleteProject(deletedId);

    expect(await getProject(await createUser({ role: "CONTRACTOR" }), closedId)).toBeNull();
    expect(await getProject(await createUser({ role: "EMPLOYEE" }), closedId)).toMatchObject({
      status: "CLOSED",
    });
    for (const role of ["ADMIN", "EMPLOYEE", "CONTRACTOR"] as const) {
      expect(await getProject(await createUser({ role }), deletedId)).toBeNull();
    }
  });

  it("reads the budget only with projects.budget.read and names who closed the project", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const id = await createdBy(manager);
    await changeProjectStatus(id, "CLOSED");

    const full = await getProject(manager, id);
    expect(full?.budget).toEqual({
      amount: "12500.50",
      vatRate: "STANDARD_21",
      amountWithVat: "15125.61",
      hours: "1250.00",
    });
    expect(full?.stamps?.closed?.by).toMatchObject({ login: manager.login });

    const employee = await getProject(await createUser({ role: "EMPLOYEE" }), id);
    expect(employee).not.toHaveProperty("budget");
    expect(employee?.customer?.name).toBe("Bakker Vastgoed B.V.");
  });
});

describe("the budget in the history", () => {
  it("is shown to an employee as changed, without values", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const id = await createdBy(manager);
    await updateProject(id, {
      ...(await openForm(manager, id)),
      name: "Renovatie hal",
      budgetAmount: "13000",
      vatRate: "REDUCED_9",
    });

    const employee = await createUser({ role: "EMPLOYEE" });
    const { rows } = await listEntityAuditLogs(employee, "Project", id, historyTable);

    const [update, create] = rows;
    expect(update.changes).toEqual([
      { field: "name", before: "Renovatie kantoor", after: "Renovatie hal" },
      withheldBudget,
    ]);
    expect(create.changes).toContainEqual(withheldBudget);
    const text = JSON.stringify(rows);
    for (const value of ["budgetAmount", "vatRate", "budgetHours", "€", "21 %", "9 %", "1250"]) {
      expect(text).not.toContain(value);
    }

    const managerRows = (await listEntityAuditLogs(manager, "Project", id, historyTable)).rows;
    expect(managerRows[0].changes).toContainEqual({
      field: "budgetAmount",
      before: `12${NBSP}500,50${NBSP}€`,
      after: `13${NBSP}000,00${NBSP}€`,
    });
  });

  it("is shown in the journal with values to its reader", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await createdBy(admin);

    const { rows } = await listAuditLogs(admin, {
      actor: "",
      actions: [],
      entity: "Project",
      from: "",
      to: "",
      table: historyTable,
    });

    expect(rows[0].changes).toContainEqual({ field: "vatRate", before: null, after: "21 %" });
  });
});
