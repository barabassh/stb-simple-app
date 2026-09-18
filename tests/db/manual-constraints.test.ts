import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

// Constraints added to the migration SQL by hand (docs/СХЕМА-БД.md, 8.3 and 9.3). Prisma does
// not describe them, so squashing or regenerating the migrations would drop them silently;
// these tests fail instead.

const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";

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

describe("the list of hand-written constraints", () => {
  // A constraint added by hand later must get a test here; one lost from the migrations
  // fails both this test and its own.
  it("matches the CHECK constraints and partial or expression indexes of the database", async () => {
    const checks = await db.$queryRaw<{ name: string }[]>`
      SELECT c.conname AS name
      FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.contype = 'c'
      ORDER BY 1`;
    const indexes = await db.$queryRaw<{ name: string }[]>`
      SELECT i.relname AS name
      FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid
      JOIN pg_namespace n ON n.oid = i.relnamespace
      WHERE n.nspname = 'public' AND (x.indpred IS NOT NULL OR x.indexprs IS NOT NULL)
      ORDER BY 1`;

    expect(checks.map((row) => row.name)).toEqual([
      "CompanyProfile_singleton_check",
      "Customer_person_fields_check",
      "Project_budget_vat_rate_check",
      "Project_closed_at_check",
    ]);
    expect(indexes.map((row) => row.name)).toEqual([
      "CompanyAddress_companyId_type_active_key",
      "Project_number_active_key",
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
