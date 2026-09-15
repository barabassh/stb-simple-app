import { describe, expect, it } from "vitest";

import { checkAuditExportPeriod } from "@/features/audit/schemas";
import { monthPeriodEnd } from "@/lib/format";

describe("monthPeriodEnd", () => {
  it.each([
    ["2026-08-15", "2026-09-14"],
    ["2026-08-01", "2026-08-31"],
    ["2026-01-31", "2026-02-28"],
    ["2024-01-30", "2024-02-29"],
    ["2024-01-29", "2024-02-28"],
    ["2026-12-15", "2027-01-14"],
  ])("a period starting on %s ends no later than %s", (start, end) => {
    expect(monthPeriodEnd(start)).toBe(end);
  });
});

describe("checkAuditExportPeriod", () => {
  it("accepts a period of up to one calendar month", () => {
    expect(checkAuditExportPeriod({ from: "2026-08-15", to: "2026-09-14" })).toBeNull();
    expect(checkAuditExportPeriod({ from: "2026-01-31", to: "2026-02-28" })).toBeNull();
    expect(checkAuditExportPeriod({ from: "2026-09-15", to: "2026-09-15" })).toBeNull();
  });

  it("asks for a period while a date is missing", () => {
    const required = { error: "audit.export.periodRequired" };
    expect(checkAuditExportPeriod({ from: "", to: "" })).toEqual(required);
    expect(checkAuditExportPeriod({ from: "2026-08-15", to: "" })).toEqual(required);
  });

  it("refuses a period that ends before it starts", () => {
    expect(checkAuditExportPeriod({ from: "2026-09-15", to: "2026-09-01" })).toEqual({
      error: "audit.export.periodReversed",
    });
  });

  it("refuses a longer period and names the last day allowed", () => {
    expect(checkAuditExportPeriod({ from: "2026-08-15", to: "2026-09-15" })).toEqual({
      error: "audit.export.periodTooLong",
      errorValues: { from: "15.08.2026", latest: "14.09.2026" },
    });
  });
});
