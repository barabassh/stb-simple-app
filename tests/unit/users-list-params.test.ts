import { describe, expect, it } from "vitest";

import { hasUserFilters, parseUsersListParams } from "@/features/users/list-params";

describe("parseUsersListParams", () => {
  it("falls back to active users sorted by full name", () => {
    const params = parseUsersListParams({});

    expect(params).toEqual({
      query: "",
      roles: [],
      status: "active",
      table: { page: 1, pageSize: 25, sort: { column: "fullName", order: "asc" } },
    });
    expect(hasUserFilters(params)).toBe(false);
  });

  it("reads search, roles and status, dropping unknown values", () => {
    const params = parseUsersListParams(
      new URLSearchParams("q=+ivan+&role=MANAGER,ROOT,ADMIN,MANAGER&status=inactive&sort=role"),
    );

    expect(params.query).toBe("ivan");
    expect(params.roles).toEqual(["ADMIN", "MANAGER"]);
    expect(params.status).toBe("inactive");
    expect(params.table.sort).toEqual({ column: "role", order: "asc" });
    expect(hasUserFilters(params)).toBe(true);
  });

  it("counts showing all statuses as a filter", () => {
    expect(hasUserFilters(parseUsersListParams({ status: "all" }))).toBe(true);
  });

  it("ignores an unknown status and a column that is not sortable", () => {
    const params = parseUsersListParams({ status: "deleted", sort: "passwordHash" });

    expect(params.status).toBe("active");
    expect(params.table.sort).toEqual({ column: "fullName", order: "asc" });
  });
});
