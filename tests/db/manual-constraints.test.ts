import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

import { createUser } from "./helpers";

// Constraints added to the migration SQL by hand (docs/СХЕМА-БД.md, 8.3, 9.3 and 10.3). Prisma does
// not describe them, so squashing or regenerating the migrations would drop them silently;
// these tests fail instead.

const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";
const EXCLUSION_VIOLATION = "23P01";

/** The SQLSTATE and the constraint name PostgreSQL rejected the write with. */
async function violation(write: Promise<unknown>) {
  try {
    await write;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
    // Read from the driver adapter's error: Prisma's own message names a unique index
    // differently from a check constraint.
    const cause = (
      error.meta?.driverAdapterError as
        { cause?: { originalCode?: string; originalMessage?: string } } | undefined
    )?.cause;
    const message = cause?.originalMessage ?? error.message;
    return {
      code: cause?.originalCode,
      constraint: /constraint "([^"]+)"/.exec(message)?.[1] ?? message,
    };
  }
  throw new Error("The database accepted a write that the constraint must reject");
}

const checkViolation = (constraint: string) => ({ code: CHECK_VIOLATION, constraint });
const uniqueViolation = (constraint: string) => ({ code: UNIQUE_VIOLATION, constraint });
const exclusionViolation = (constraint: string) => ({ code: EXCLUSION_VIOLATION, constraint });

let sequence = 0;

async function createCustomer() {
  return db.customer.create({ data: { type: "COMPANY", name: "Bakker B.V." } });
}

function project(customerId: string, data: Partial<Prisma.ProjectUncheckedCreateInput> = {}) {
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
  });
}

describe("the list of hand-written constraints", () => {
  // A constraint added by hand later must get a test here; one lost from the migrations
  // fails both this test and its own.
  it("matches the CHECK and exclusion constraints and the partial or expression indexes", async () => {
    const checks = await db.$queryRaw<{ name: string }[]>`
      SELECT c.conname AS name
      FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.contype = 'c'
      ORDER BY 1`;
    const exclusions = await db.$queryRaw<{ name: string }[]>`
      SELECT c.conname AS name
      FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.contype = 'x'
      ORDER BY 1`;
    const indexes = await db.$queryRaw<{ name: string }[]>`
      SELECT i.relname AS name
      FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid
      JOIN pg_namespace n ON n.oid = i.relnamespace
      WHERE n.nspname = 'public' AND (x.indpred IS NOT NULL OR x.indexprs IS NOT NULL)
        -- The index of an exclusion constraint is listed with the constraint.
        AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = x.indexrelid)
      ORDER BY 1`;

    expect(checks.map((row) => row.name)).toEqual([
      "CompanyProfile_singleton_check",
      "Customer_person_fields_check",
      "Project_budget_vat_rate_check",
      "Project_closed_at_check",
      "WorkReport_approved_check",
      "WorkReport_lunch_check",
      "WorkReport_mileage_check",
      "WorkReport_time_check",
      "WorkReport_unapproval_check",
    ]);
    expect(exclusions.map((row) => row.name)).toEqual(["WorkReport_no_overlap"]);
    expect(indexes.map((row) => row.name)).toEqual([
      "CompanyAddress_companyId_type_active_key",
      "Project_name_in_progress_key",
      "Project_number_active_key",
      "User_nickname_key",
    ]);
  });
});

describe("CompanyProfile_singleton_check", () => {
  it("rejects a profile whose singleton flag is not true", async () => {
    await db.companyProfile.create({ data: { legalName: "Bouwbedrijf B.V." } });

    // Without the check this second row would pass: the unique index allows one "false".
    expect(
      await violation(db.companyProfile.create({ data: { legalName: "Other", singleton: false } })),
    ).toEqual(checkViolation("CompanyProfile_singleton_check"));
    expect(await db.companyProfile.count()).toBe(1);
  });
});

describe("CompanyAddress_companyId_type_active_key", () => {
  async function createCompany() {
    return db.companyProfile.create({ data: { legalName: "Bouwbedrijf B.V." } });
  }

  function address(companyId: string, type: "OFFICE" | "POSTAL" | "WAREHOUSE", deletedAt?: Date) {
    return db.companyAddress.create({
      data: { companyId, type, postcode: "3741 RS", city: "Baarn", deletedAt },
    });
  }

  it.each(["OFFICE", "POSTAL"] as const)("rejects a second active %s address", async (type) => {
    const company = await createCompany();
    await address(company.id, type);

    expect(await violation(address(company.id, type))).toEqual(
      uniqueViolation("CompanyAddress_companyId_type_active_key"),
    );
  });

  it("allows an office and a postal address together, and any number of warehouses", async () => {
    const company = await createCompany();

    await address(company.id, "OFFICE");
    await address(company.id, "POSTAL");
    await address(company.id, "WAREHOUSE");
    await address(company.id, "WAREHOUSE");

    expect(await db.companyAddress.count()).toBe(4);
  });

  it("does not count deleted addresses, and rejects restoring one over an active address", async () => {
    const company = await createCompany();
    const old = await address(company.id, "OFFICE", new Date("2026-09-01T10:00:00Z"));
    await address(company.id, "OFFICE");

    expect(
      await violation(
        db.companyAddress.update({ where: { id: old.id }, data: { deletedAt: null } }),
      ),
    ).toEqual(uniqueViolation("CompanyAddress_companyId_type_active_key"));
  });
});

describe("Customer_person_fields_check", () => {
  it.each([
    { kvkNumber: "12345678" },
    { vatId: "NL123456789B01" },
    { contactPerson: "Jan de Vries" },
  ])("rejects a private customer with %o", async (field) => {
    expect(
      await violation(
        db.customer.create({ data: { type: "PERSON", name: "P. Jansen", ...field } }),
      ),
    ).toEqual(checkViolation("Customer_person_fields_check"));
  });

  it("rejects turning a company with company fields into a private customer", async () => {
    const customer = await db.customer.create({
      data: { type: "COMPANY", name: "Bakker B.V.", kvkNumber: "12345678" },
    });

    expect(
      await violation(db.customer.update({ where: { id: customer.id }, data: { type: "PERSON" } })),
    ).toEqual(checkViolation("Customer_person_fields_check"));
  });

  it("allows a private customer without them and a company with all of them", async () => {
    await db.customer.create({
      data: { type: "PERSON", name: "P. Jansen", email: "p@example.nl" },
    });
    await db.customer.create({
      data: {
        type: "COMPANY",
        name: "Bakker B.V.",
        kvkNumber: "12345678",
        vatId: "NL123456789B01",
        contactPerson: "Jan de Vries",
      },
    });

    expect(await db.customer.count()).toBe(2);
  });
});

describe("project constraints", () => {
  describe("Project_budget_vat_rate_check", () => {
    it("rejects a budget without a VAT rate", async () => {
      const customer = await createCustomer();

      expect(await violation(project(customer.id, { budgetAmount: "15000.00" }))).toEqual(
        checkViolation("Project_budget_vat_rate_check"),
      );
    });

    it("rejects removing the VAT rate of a project with a budget", async () => {
      const customer = await createCustomer();
      const withBudget = await project(customer.id, {
        budgetAmount: "15000.00",
        vatRate: "STANDARD_21",
      });

      expect(
        await violation(
          db.project.update({ where: { id: withBudget.id }, data: { vatRate: null } }),
        ),
      ).toEqual(checkViolation("Project_budget_vat_rate_check"));
    });

    it("allows a budget with a VAT rate, a VAT rate alone and neither", async () => {
      const customer = await createCustomer();

      await project(customer.id, { budgetAmount: "15000.00", vatRate: "STANDARD_21" });
      await project(customer.id, { vatRate: "REVERSE_CHARGE" });
      await project(customer.id);

      expect(await db.project.count()).toBe(3);
    });
  });

  describe("Project_closed_at_check", () => {
    it("rejects a closed project without the closing time", async () => {
      const customer = await createCustomer();

      expect(await violation(project(customer.id, { status: "CLOSED" }))).toEqual(
        checkViolation("Project_closed_at_check"),
      );
    });

    it("rejects a project in progress with a closing time", async () => {
      const customer = await createCustomer();

      expect(
        await violation(project(customer.id, { closedAt: new Date("2026-05-01T10:00:00Z") })),
      ).toEqual(checkViolation("Project_closed_at_check"));
    });

    it("rejects reopening a project that keeps its closing time", async () => {
      const customer = await createCustomer();
      const closed = await project(customer.id, {
        status: "CLOSED",
        closedAt: new Date("2026-05-01T10:00:00Z"),
      });

      expect(
        await violation(
          db.project.update({ where: { id: closed.id }, data: { status: "IN_PROGRESS" } }),
        ),
      ).toEqual(checkViolation("Project_closed_at_check"));
    });

    it("allows a closed project with the closing time and a project in progress without", async () => {
      const customer = await createCustomer();

      await project(customer.id, { status: "CLOSED", closedAt: new Date("2026-05-01T10:00:00Z") });
      await project(customer.id);

      expect(await db.project.count()).toBe(2);
    });
  });

  describe("Project_number_active_key", () => {
    it("rejects the number of an active project, ignoring case", async () => {
      const customer = await createCustomer();
      await project(customer.id, { number: "BRN-7a" });

      expect(await violation(project(customer.id, { number: "brn-7A" }))).toEqual(
        uniqueViolation("Project_number_active_key"),
      );
    });

    it("rejects renaming a project to a taken number", async () => {
      const customer = await createCustomer();
      await project(customer.id, { number: "BRN-7" });
      const other = await project(customer.id, { number: "BRN-8" });

      expect(
        await violation(db.project.update({ where: { id: other.id }, data: { number: "brn-7" } })),
      ).toEqual(uniqueViolation("Project_number_active_key"));
    });

    it("allows the number of a deleted project, and among deleted ones", async () => {
      const customer = await createCustomer();
      const deletedAt = new Date("2026-06-01T10:00:00Z");
      await project(customer.id, { number: "BRN-7", deletedAt });
      await project(customer.id, { number: "brn-7", deletedAt });

      await project(customer.id, { number: "Brn-7" });

      expect(
        await db.project.count({ where: { number: { equals: "brn-7", mode: "insensitive" } } }),
      ).toBe(3);
    });

    it("rejects restoring a deleted project whose number is taken again", async () => {
      const customer = await createCustomer();
      const deleted = await project(customer.id, {
        number: "BRN-7",
        deletedAt: new Date("2026-06-01T10:00:00Z"),
      });
      await project(customer.id, { number: "BRN-7" });

      expect(
        await violation(
          db.project.update({ where: { id: deleted.id }, data: { deletedAt: null } }),
        ),
      ).toEqual(uniqueViolation("Project_number_active_key"));
    });
  });
});

describe("Project_name_in_progress_key", () => {
  it("rejects the name of a project in progress, ignoring case", async () => {
    const customer = await createCustomer();
    await project(customer.id, { name: "Дом" });

    expect(await violation(project(customer.id, { name: "дом" }))).toEqual(
      uniqueViolation("Project_name_in_progress_key"),
    );
  });

  it("allows the name of a closed or a deleted project", async () => {
    const customer = await createCustomer();
    await project(customer.id, {
      name: "Дом",
      status: "CLOSED",
      closedAt: new Date("2026-05-01T10:00:00Z"),
    });
    await project(customer.id, { name: "ДОМ", deletedAt: new Date("2026-06-01T10:00:00Z") });

    await project(customer.id, { name: "дом" });

    expect(await db.project.count()).toBe(3);
  });

  it("rejects reopening a closed project whose name is taken again", async () => {
    const customer = await createCustomer();
    const closed = await project(customer.id, {
      name: "Дом",
      status: "CLOSED",
      closedAt: new Date("2026-05-01T10:00:00Z"),
    });
    await project(customer.id, { name: "дом" });

    expect(
      await violation(
        db.project.update({
          where: { id: closed.id },
          data: { status: "IN_PROGRESS", closedAt: null },
        }),
      ),
    ).toEqual(uniqueViolation("Project_name_in_progress_key"));
  });
});

describe("User_nickname_key", () => {
  it("rejects a nickname taken in another case", async () => {
    await createUser({ nickname: "Иван" });

    expect(await violation(createUser({ nickname: "иван" }))).toEqual(
      uniqueViolation("User_nickname_key"),
    );
  });

  it("counts inactive users and rejects renaming to a taken nickname", async () => {
    await createUser({ nickname: "Иван", isActive: false });
    const other = await createUser({ nickname: "Иван И." });

    expect(
      await violation(db.user.update({ where: { id: other.id }, data: { nickname: "ИВАН" } })),
    ).toEqual(uniqueViolation("User_nickname_key"));
  });

  it("allows different nicknames", async () => {
    await createUser({ nickname: "Иван" });
    await createUser({ nickname: "Иван И." });

    expect(await db.user.count()).toBe(2);
  });
});

describe("work report constraints", () => {
  type ReportData = Partial<Prisma.WorkReportUncheckedCreateInput>;

  async function setUp() {
    const customer = await createCustomer();
    const { id: projectId } = await project(customer.id);
    const worker = await createUser({ role: "EMPLOYEE" });
    const manager = await createUser({ role: "MANAGER" });
    const report = (data: ReportData = {}) =>
      db.workReport.create({
        data: {
          userId: worker.id,
          projectId,
          workDate: new Date("2026-09-18"),
          workDescription: "Tegels gelegd",
          startMinute: 8 * 60,
          endMinute: 12 * 60,
          ...data,
        },
      });
    return { manager, report };
  }

  const approved = (approvedById: string) => ({
    status: "APPROVED" as const,
    approvedAt: new Date("2026-09-18T15:00:00Z"),
    approvedById,
  });

  describe("WorkReport_time_check", () => {
    it.each([
      ["an end at 24:00", { startMinute: 20 * 60, endMinute: 24 * 60 }],
      ["a negative start", { startMinute: -30, endMinute: 8 * 60 }],
    ])("rejects %s", async (_, time) => {
      const { report } = await setUp();

      expect(await violation(report(time))).toEqual(checkViolation("WorkReport_time_check"));
    });

    // No lunch is shorter than a time at work of zero or less minutes, so the lunch check fails
    // as well, and PostgreSQL checks the constraints in the order of their names.
    it.each([
      ["an end before the start", { startMinute: 12 * 60, endMinute: 8 * 60 }],
      ["an end equal to the start", { startMinute: 8 * 60, endMinute: 8 * 60 }],
    ])("rejects %s", async (_, time) => {
      const { report } = await setUp();

      const { code, constraint } = await violation(report(time));
      expect(code).toBe(CHECK_VIOLATION);
      expect(["WorkReport_lunch_check", "WorkReport_time_check"]).toContain(constraint);
    });

    it("allows a day from 00:00 to 23:59", async () => {
      const { report } = await setUp();

      await report({ startMinute: 0, endMinute: 1439 });

      expect(await db.workReport.count()).toBe(1);
    });
  });

  describe("WorkReport_lunch_check", () => {
    it.each([
      ["as long as the time at work", 4 * 60],
      ["below zero", -1],
    ])("rejects a lunch %s", async (_, lunchMinutes) => {
      const { report } = await setUp();

      expect(await violation(report({ lunchMinutes }))).toEqual(
        checkViolation("WorkReport_lunch_check"),
      );
    });

    it("allows a lunch shorter than the time at work", async () => {
      const { report } = await setUp();

      await report({ lunchMinutes: 4 * 60 - 1 });

      expect(await db.workReport.count()).toBe(1);
    });
  });

  describe("WorkReport_mileage_check", () => {
    it.each([2001, -1])("rejects %i km", async (mileageKm) => {
      const { report } = await setUp();

      expect(await violation(report({ mileageKm }))).toEqual(
        checkViolation("WorkReport_mileage_check"),
      );
    });

    it("allows 0 and 2000 km", async () => {
      const { report } = await setUp();

      await report({ mileageKm: 0 });
      await report({ mileageKm: 2000, startMinute: 13 * 60, endMinute: 17 * 60 });

      expect(await db.workReport.count()).toBe(2);
    });
  });

  describe("WorkReport_approved_check", () => {
    it("rejects an approved report without the approval time", async () => {
      const { report } = await setUp();

      expect(await violation(report({ status: "APPROVED" }))).toEqual(
        checkViolation("WorkReport_approved_check"),
      );
    });

    it("rejects an unapproved report with an approval time", async () => {
      const { report } = await setUp();

      expect(await violation(report({ approvedAt: new Date("2026-09-18T15:00:00Z") }))).toEqual(
        checkViolation("WorkReport_approved_check"),
      );
    });

    it("allows an approved report with the approval time and an unapproved one without", async () => {
      const { manager, report } = await setUp();

      await report(approved(manager.id));
      await report({ startMinute: 13 * 60, endMinute: 17 * 60 });

      expect(await db.workReport.count()).toBe(2);
    });
  });

  describe("WorkReport_unapproval_check", () => {
    it("rejects approving a report that keeps the reason of its unapproval", async () => {
      const { manager, report } = await setUp();
      const unapproved = await report({
        unapprovalReason: "Verkeerde datum",
        unapprovedAt: new Date("2026-09-18T16:00:00Z"),
        unapprovedById: manager.id,
      });

      expect(
        await violation(
          db.workReport.update({ where: { id: unapproved.id }, data: approved(manager.id) }),
        ),
      ).toEqual(checkViolation("WorkReport_unapproval_check"));
    });

    it("allows approving it once the reason is cleared", async () => {
      const { manager, report } = await setUp();
      const unapproved = await report({ unapprovalReason: "Verkeerde datum" });

      await db.workReport.update({
        where: { id: unapproved.id },
        data: { ...approved(manager.id), unapprovalReason: null },
      });

      expect(await db.workReport.count({ where: { status: "APPROVED" } })).toBe(1);
    });
  });

  describe("WorkReport_no_overlap", () => {
    it("rejects an overlapping report of the same worker on the same day", async () => {
      const { report } = await setUp();
      await report({ startMinute: 8 * 60, endMinute: 12 * 60 });

      expect(await violation(report({ startMinute: 11 * 60, endMinute: 15 * 60 }))).toEqual(
        exclusionViolation("WorkReport_no_overlap"),
      );
    });

    it("rejects moving a report onto another one", async () => {
      const { report } = await setUp();
      await report({ startMinute: 8 * 60, endMinute: 12 * 60 });
      const afternoon = await report({ startMinute: 13 * 60, endMinute: 17 * 60 });

      expect(
        await violation(
          db.workReport.update({ where: { id: afternoon.id }, data: { startMinute: 10 * 60 } }),
        ),
      ).toEqual(exclusionViolation("WorkReport_no_overlap"));
    });

    it("allows a report that starts when the other one ends", async () => {
      const { report } = await setUp();
      await report({ startMinute: 8 * 60, endMinute: 12 * 60 });

      await report({ startMinute: 12 * 60, endMinute: 16 * 60 });

      expect(await db.workReport.count()).toBe(2);
    });

    it("allows the same time for another worker and on another day", async () => {
      const { report } = await setUp();
      const otherWorker = await createUser({ role: "CONTRACTOR" });
      await report();

      await report({ userId: otherWorker.id });
      await report({ workDate: new Date("2026-09-17") });

      expect(await db.workReport.count()).toBe(3);
    });

    it("frees the interval of a deleted report", async () => {
      const { report } = await setUp();
      await report({ deletedAt: new Date("2026-09-18T18:00:00Z") });

      await report();

      expect(await db.workReport.count()).toBe(2);
    });
  });
});
