import { describe, expect, it } from "vitest";

import { hasAuditFilters, parseAuditListParams } from "@/features/audit/list-params";

describe("parseAuditListParams", () => {
  it("falls back to the whole log, newest first", () => {
    const params = parseAuditListParams({});

    expect(params).toEqual({
      actor: "",
      actions: [],
      entity: null,
      from: "",
      to: "",
      table: { page: 1, pageSize: 25, sort: { column: "at", order: "desc" } },
    });
    expect(hasAuditFilters(params)).toBe(false);
  });

  it("reads author, actions, entity and period, dropping unknown values", () => {
    const params = parseAuditListParams(
      new URLSearchParams(
        "actor=+ivanov+&action=LOGIN_FAILED,HACK,LOGIN&entity=Session&from=2026-09-01&to=2026-09-14&order=asc",
      ),
    );

    expect(params).toMatchObject({
      actor: "ivanov",
      actions: ["LOGIN", "LOGIN_FAILED"],
      entity: "Session",
      from: "2026-09-01",
      to: "2026-09-14",
    });
    expect(hasAuditFilters(params)).toBe(true);
  });

  it("ignores an unknown entity, an invalid date and a column that is not sortable", () => {
    const params = parseAuditListParams({
      entity: "Expense",
      from: "2026-02-30",
      to: "yesterday",
      sort: "summary",
    });

    expect(params).toMatchObject({ entity: null, from: "", to: "" });
    expect(params.table.sort).toEqual({ column: "at", order: "desc" });
    expect(hasAuditFilters(params)).toBe(false);
  });
});
