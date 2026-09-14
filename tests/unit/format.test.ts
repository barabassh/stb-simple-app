import { describe, expect, it } from "vitest";

import { formatDate, formatDateTime, formatNumber } from "@/lib/format";

describe("formatDate", () => {
  it("formats as dd.MM.yyyy in Europe/Kyiv", () => {
    expect(formatDate(new Date("2026-09-14T08:20:00Z"))).toBe("14.09.2026");
  });

  it("uses the Kyiv calendar day, not the UTC one", () => {
    expect(formatDate("2026-09-13T21:30:00Z")).toBe("14.09.2026");
  });

  it("returns an empty string for missing values", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate(undefined)).toBe("");
  });
});

describe("formatDateTime", () => {
  it("applies summer time (UTC+3)", () => {
    expect(formatDateTime("2026-09-14T08:20:00Z")).toBe("14.09.2026 11:20");
  });

  it("applies winter time (UTC+2) and a 24-hour clock", () => {
    expect(formatDateTime("2026-01-15T22:30:00Z")).toBe("16.01.2026 00:30");
  });
});

describe("formatNumber", () => {
  it("groups digits with a non-breaking space and uses a decimal comma", () => {
    expect(formatNumber(1234567.891)).toBe("1 234 567,89");
  });

  it("groups four-digit and negative numbers", () => {
    expect(formatNumber(-1234.5)).toBe("-1 234,5");
  });

  it("respects fraction digit options", () => {
    expect(formatNumber(1000, { minimumFractionDigits: 2 })).toBe("1 000,00");
  });
});
