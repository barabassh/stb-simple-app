import { describe, expect, it } from "vitest";

import { parseTableState } from "@/components/data-table/search-params";

const options = {
  sortableColumns: ["login", "createdAt"],
  defaultSort: { column: "createdAt", order: "desc" },
} as const;

describe("parseTableState", () => {
  it("uses defaults when the URL has no table parameters", () => {
    expect(parseTableState({}, options)).toEqual({
      page: 1,
      pageSize: 25,
      sort: { column: "createdAt", order: "desc" },
    });
  });

  it("reads page, page size and sort, ignoring other parameters", () => {
    const params = new URLSearchParams("page=3&pageSize=100&sort=login&order=desc&search=ivanov");

    expect(parseTableState(params, options)).toEqual({
      page: 3,
      pageSize: 100,
      sort: { column: "login", order: "desc" },
    });
  });

  it.each(["0", "-2", "1.5", "abc", "99999999999999999999"])(
    "falls back to the first page for page=%s",
    (page) => {
      expect(parseTableState({ page }, options).page).toBe(1);
    },
  );

  it("accepts only the offered page sizes", () => {
    expect(parseTableState({ pageSize: "30" }, options).pageSize).toBe(25);
    expect(parseTableState({ pageSize: "50" }, options).pageSize).toBe(50);
  });

  it("ignores sorting by a column that is not whitelisted", () => {
    expect(parseTableState({ sort: "passwordHash", order: "asc" }, options).sort).toEqual({
      column: "createdAt",
      order: "desc",
    });
  });

  it("sorts ascending when the order is missing or unknown", () => {
    expect(parseTableState({ sort: "login", order: "up" }, options).sort).toEqual({
      column: "login",
      order: "asc",
    });
  });

  it("takes the first value of a repeated parameter", () => {
    expect(parseTableState({ page: ["2", "5"] }, options).page).toBe(2);
  });
});
