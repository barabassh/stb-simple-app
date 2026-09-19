import { describe, expect, it } from "vitest";

import { projectsExport } from "@/features/projects/export";
import { parseProjectsListParams, type ProjectsListParams } from "@/features/projects/list-params";
import { listProjects, listProjectsForExport } from "@/features/projects/queries";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { PermissionDeniedError } from "@/lib/permissions";

import { createUser, exportDocument } from "./helpers";

let sequence = 0;

async function createCustomer(name: string, isActive = true) {
  return db.customer.create({ data: { type: "COMPANY", name, isActive }, select: { id: true } });
}

async function createProject(
  customerId: string,
  data: Partial<Prisma.ProjectUncheckedCreateInput> = {},
) {
  sequence += 1;
  return db.project.create({
    data: {
      number: `2026-${String(sequence).padStart(3, "0")}`,
      name: `Project ${sequence}`,
      customerId,
      street: "de Geerenweg",
      houseNumber: 4,
      postcode: "3741 RS",
      city: "Baarn",
      startDate: new Date("2026-03-01"),
      ...data,
    },
    select: { id: true, number: true },
  });
}

/** Parameters as a caller could pass them directly, with every status and filter asked for. */
function params(changes: Partial<ProjectsListParams> = {}): ProjectsListParams {
  return {
    query: "",
    status: "inProgress",
    customerId: null,
    table: { page: 1, pageSize: 25, sort: { column: "startDate", order: "desc" } },
    ...changes,
  };
}

const numbers = (rows: { number: string }[]) => rows.map((row) => row.number).sort();

describe("listProjects", () => {
  it("gives a contractor only projects in progress, whatever the parameters ask for", async () => {
    const contractor = await createUser({ role: "CONTRACTOR" });
    const customer = await createCustomer("Bakker B.V.");
    const open = await createProject(customer.id);
    await createProject(customer.id, {
      status: "CLOSED",
      closedAt: new Date("2026-05-01T10:00:00Z"),
    });

    for (const status of ["all", "closed"] as const) {
      const { rows, rowCount } = await listProjects(
        contractor,
        params({ status, customerId: customer.id }),
      );
      expect(numbers(rows)).toEqual([open.number]);
      expect(rowCount).toBe(1);
    }
  });

  it("reads for a contractor the fields of the registry and nothing about the customer", async () => {
    const contractor = await createUser({ role: "CONTRACTOR" });
    const customer = await createCustomer("Bakker B.V.");
    await createProject(customer.id, { budgetAmount: "12500.50", vatRate: "STANDARD_21" });

    const { rows } = await listProjects(contractor, params());
    expect(Object.keys(rows[0]).sort()).toEqual(
      ["address", "duration", "id", "name", "number", "startDate"].sort(),
    );
    // A match by the customer's name would tell a contractor who the customer is.
    expect((await listProjects(contractor, params({ query: "Bakker" }))).rowCount).toBe(0);
  });

  it("does not read the budget for an employee, nor sort by it", async () => {
    const employee = await createUser({ role: "EMPLOYEE" });
    const customer = await createCustomer("Bakker B.V.");
    await createProject(customer.id, {
      budgetAmount: "12500.50",
      vatRate: "STANDARD_21",
      budgetHours: "120",
    });

    const { rows } = await listProjects(employee, params());
    expect(rows[0]).not.toHaveProperty("budget");
    expect(JSON.stringify(rows)).not.toMatch(/12500|120\.00|STANDARD_21/);
    expect(rows[0]).toMatchObject({
      customer: { name: "Bakker B.V." },
      status: "IN_PROGRESS",
    });

    const sorted = parseProjectsListParams({ sort: "budgetAmount" }, { all: true, budget: false });
    expect(sorted.table.sort).toEqual({ column: "startDate", order: "desc" });
  });

  it("gives an administrator the budget as exact decimals with the total including VAT", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const customer = await createCustomer("Bakker B.V.");
    await createProject(customer.id, {
      budgetAmount: "12500.50",
      vatRate: "STANDARD_21",
      budgetHours: "1250.5",
    });

    const { rows } = await listProjects(admin, params());
    expect(rows[0].budget).toEqual({
      amount: "12500.50",
      vatRate: "STANDARD_21",
      amountWithVat: "15125.61",
      hours: "1250.50",
    });
  });

  it("leaves a deleted project out for every role and the export", async () => {
    const customer = await createCustomer("Bakker B.V.");
    const kept = await createProject(customer.id);
    await createProject(customer.id, { deletedAt: new Date() });
    await createProject(customer.id, {
      deletedAt: new Date(),
      status: "CLOSED",
      closedAt: new Date(),
    });

    for (const role of ["ADMIN", "MANAGER", "EMPLOYEE", "CONTRACTOR"] as const) {
      const actor = await createUser({ role });
      const { rows, rowCount } = await listProjects(actor, params({ status: "all" }));
      expect(numbers(rows)).toEqual([kept.number]);
      expect(rowCount).toBe(1);
    }

    const admin = await createUser({ role: "ADMIN" });
    expect(numbers(await listProjectsForExport(admin, params({ status: "all" })))).toEqual([
      kept.number,
    ]);
  });

  it("filters by status and customer and searches the number, name, customer and city", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const bakker = await createCustomer("Bakker B.V.");
    const visser = await createCustomer("Visser Bouw", false);
    const inBaarn = await createProject(bakker.id, { name: "Dakrenovatie" });
    const inUtrecht = await createProject(visser.id, { city: "Utrecht" });
    const closed = await createProject(visser.id, {
      status: "CLOSED",
      closedAt: new Date("2026-05-01T10:00:00Z"),
    });

    const list = async (changes: Partial<ProjectsListParams>) =>
      numbers((await listProjects(manager, params(changes))).rows);

    expect(await list({})).toEqual(numbers([inBaarn, inUtrecht]));
    expect(await list({ status: "closed" })).toEqual([closed.number]);
    expect(await list({ status: "all", customerId: visser.id })).toEqual(
      numbers([inUtrecht, closed]),
    );
    expect(await list({ query: "utrecht" })).toEqual([inUtrecht.number]);
    expect(await list({ query: "visser", status: "all" })).toEqual(numbers([inUtrecht, closed]));
    expect(await list({ query: "dakren" })).toEqual([inBaarn.number]);
    expect(await list({ query: inBaarn.number })).toEqual([inBaarn.number]);
  });

  it("sorts by the start date, newest first, by default and pages on the server", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const customer = await createCustomer("Bakker B.V.");
    const older = await createProject(customer.id, { startDate: new Date("2026-01-10") });
    const newer = await createProject(customer.id, { startDate: new Date("2026-06-10") });
    const middle = await createProject(customer.id, { startDate: new Date("2026-03-10") });

    const defaults = parseProjectsListParams({}, { all: true, budget: true });
    const { rows } = await listProjects(admin, defaults);
    expect(rows.map((row) => row.number)).toEqual([newer.number, middle.number, older.number]);

    const second = await listProjects(admin, {
      ...defaults,
      table: { ...defaults.table, page: 2, pageSize: 25 },
    });
    expect(second).toEqual({ rows: [], rowCount: 3 });
  });
});

describe("the projects export", () => {
  it("is refused to an employee and a contractor", async () => {
    for (const role of ["EMPLOYEE", "CONTRACTOR"] as const) {
      const actor = await createUser({ role });
      await expect(listProjectsForExport(actor, params())).rejects.toBeInstanceOf(
        PermissionDeniedError,
      );
      await expect(exportDocument(actor, projectsExport, {})).rejects.toBeInstanceOf(
        PermissionDeniedError,
      );
    }
  });

  it("follows the filters and writes sums as numbers with the VAT rate and total", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const customer = await createCustomer("Bakker B.V.");
    await createProject(customer.id, {
      budgetAmount: "12500.50",
      vatRate: "STANDARD_21",
      budgetHours: "40",
    });
    await createProject(customer.id, {
      status: "CLOSED",
      closedAt: new Date("2026-05-01T10:00:00Z"),
    });

    const content = await exportDocument(manager, projectsExport, {});
    expect(content.columns.map((column) => column.key)).toEqual([
      "number",
      "name",
      "customer",
      "address",
      "startDate",
      "duration",
      "status",
      "budgetAmount",
      "vatRate",
      "budgetWithVat",
      "budgetHours",
      "updatedAt",
    ]);
    expect(content.rows).toHaveLength(1);
    expect(content.rows[0]).toMatchObject({
      customer: "Bakker B.V.",
      address: "de Geerenweg 4, 3741 RS Baarn",
      budgetAmount: 12500.5,
      vatRate: "21 %",
      budgetWithVat: 15125.61,
      budgetHours: 40,
    });

    const all = await exportDocument(manager, projectsExport, { status: "all" });
    expect(all.rows).toHaveLength(2);
  });
});
