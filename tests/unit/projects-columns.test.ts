import { describe, expect, it } from "vitest";

import { projectAccess, projectColumns, projectSortColumns } from "@/features/projects/columns";
import { parseProjectsListParams } from "@/features/projects/list-params";

const access = {
  ADMIN: projectAccess({ role: "ADMIN" }),
  MANAGER: projectAccess({ role: "MANAGER" }),
  EMPLOYEE: projectAccess({ role: "EMPLOYEE" }),
  CONTRACTOR: projectAccess({ role: "CONTRACTOR" }),
};

describe("projectColumns", () => {
  it("follows the table of docs/ТЗ.md, 6.8 for every role", () => {
    const full = [
      "number",
      "name",
      "customer",
      "address",
      "startDate",
      "duration",
      "status",
      "budgetAmount",
      "budgetHours",
      "updatedAt",
    ];
    expect(projectColumns(access.ADMIN, "table")).toEqual(full);
    expect(projectColumns(access.MANAGER, "table")).toEqual(full);
    expect(projectColumns(access.EMPLOYEE, "table")).toEqual(
      full.filter((column) => !column.startsWith("budget")),
    );
    expect(projectColumns(access.CONTRACTOR, "table")).toEqual([
      "number",
      "name",
      "address",
      "startDate",
      "duration",
    ]);
  });

  it("adds the VAT rate and the total to the export after the budget", () => {
    expect(projectColumns(access.MANAGER, "export")).toEqual([
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
    expect(projectColumns(access.EMPLOYEE, "export")).not.toContain("vatRate");
  });

  it("sorts by every visible column but the duration and the address", () => {
    expect(projectSortColumns(access.EMPLOYEE)).toEqual([
      "number",
      "name",
      "customer",
      "startDate",
      "status",
      "updatedAt",
    ]);
    expect(projectSortColumns(access.CONTRACTOR)).toEqual(["number", "name", "startDate"]);
  });
});

describe("parseProjectsListParams", () => {
  const url = { q: " 2026 ", status: "all", customer: "cabc", sort: "customer", order: "asc" };

  it("reads the filters and defaults to projects in progress, newest start first", () => {
    expect(parseProjectsListParams(url, access.ADMIN)).toMatchObject({
      query: "2026",
      status: "all",
      customerId: "cabc",
      table: { sort: { column: "customer", order: "asc" } },
    });
    expect(parseProjectsListParams({ status: "open" }, access.ADMIN)).toMatchObject({
      status: "inProgress",
      customerId: null,
      table: { page: 1, pageSize: 25, sort: { column: "startDate", order: "desc" } },
    });
  });

  it("drops the filters and the sorting a contractor does not have", () => {
    expect(parseProjectsListParams(url, access.CONTRACTOR)).toMatchObject({
      query: "2026",
      status: "inProgress",
      customerId: null,
      table: { sort: { column: "startDate", order: "desc" } },
    });
  });
});
