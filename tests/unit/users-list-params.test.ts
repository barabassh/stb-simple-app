import { describe, expect, it } from "vitest";

import { hasUserFilters, parseUsersListParams } from "@/features/users/list-params";

describe("parseUsersListParams", () => {
  it("falls back to no filters and sorting by full name", () => {
    const params = parseUsersListParams({});

    expect(params).toEqual({
      query: "",
      roles: [],
      status: "all",
      table: { page: 1, pageSize: 25, sort: { column: "fullName", order: "asc" } },
    });
    expect(hasUserFilters(params)).toBe(false);
  });

  it("reads search, roles and status, dropping unknown values", () => {
    const params = parseUsersListParams(
      new URLSearchParams("q=+ivan+&role=MANAGER,ROOT,ADMIN,MANAGER&status=blocked&sort=role"),
    );

    expect(params.query).toBe("ivan");
    expect(params.roles).toEqual(["ADMIN", "MANAGER"]);
    expect(params.status).toBe("blocked");
    expect(params.table.sort).toEqual({ column: "role", order: "asc" });
    expect(hasUserFilters(params)).toBe(true);
  });

  it("ignores an unknown status and a column that is not sortable", () => {
    const params = parseUsersListParams({ status: "deleted", sort: "passwordHash" });

    expect(params.status).toBe("all");
    expect(params.table.sort).toEqual({ column: "fullName", order: "asc" });
  });
});
