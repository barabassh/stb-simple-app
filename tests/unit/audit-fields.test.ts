import { describe, expect, it } from "vitest";

import { AUDIT_FIELD_RULES, auditFieldRules } from "@/features/audit/fields";
import { db } from "@/lib/db";

// A money field shown in the history to a reader without the right to it would go unnoticed:
// the log writes every field alike. So every Decimal field of the schema has to be marked
// (docs/АРХИТЕКТУРА.md, 3.12).

type DataModel = Record<string, { fields: { name: string; kind: string; type: string }[] }>;

// Prisma 7 no longer exports Prisma.dmmf; the client keeps the same description of the models.
// Reading it opens no connection.
const models = (db as unknown as { _runtimeDataModel: { models: DataModel } })._runtimeDataModel
  .models;

/** The Decimal fields with no rule: neither a right to read them nor "not financial". */
function unmarkedDecimalFields(dataModel: DataModel): string[] {
  return Object.entries(dataModel).flatMap(([model, { fields }]) => {
    const rules = auditFieldRules(model);
    return fields
      .filter((field) => field.kind === "scalar" && field.type === "Decimal")
      .filter((field) => !Object.hasOwn(rules, field.name))
      .map((field) => `${model}.${field.name}`);
  });
}

describe("the rules of the audit fields", () => {
  it("reads the models of the schema", () => {
    expect(Object.keys(models)).toEqual(expect.arrayContaining(["User", "Project", "WorkReport"]));
    expect(models.Project.fields).toContainEqual(
      expect.objectContaining({ name: "budgetAmount", type: "Decimal" }),
    );
  });

  it("mark every Decimal field of the schema", () => {
    expect(unmarkedDecimalFields(models)).toEqual([]);
  });

  it("catch a Decimal field added without a mark", () => {
    const withDiscount: DataModel = {
      ...models,
      Project: {
        fields: [...models.Project.fields, { name: "discount", kind: "scalar", type: "Decimal" }],
      },
      Invoice: { fields: [{ name: "total", kind: "scalar", type: "Decimal" }] },
    };

    expect(unmarkedDecimalFields(withDiscount)).toEqual(["Project.discount", "Invoice.total"]);
  });

  it("name only fields the models have", () => {
    for (const [entity, rules] of Object.entries(AUDIT_FIELD_RULES)) {
      const fields = models[entity]?.fields.map(({ name }) => name) ?? [];
      expect(fields, entity).toEqual(expect.arrayContaining(Object.keys(rules)));
    }
  });

  it("keep the budget of a project behind projects.budget.read", () => {
    expect(auditFieldRules("Project")).toEqual({
      budgetAmount: { readPermission: "projects.budget.read", withheldAs: "budget" },
      vatRate: { readPermission: "projects.budget.read", withheldAs: "budget" },
      budgetHours: { readPermission: "projects.budget.read", withheldAs: "budget" },
    });
    expect(auditFieldRules("toString")).toEqual({});
  });
});
