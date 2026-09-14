import { describe, expect, it } from "vitest";

import {
  displayDayRange,
  formatDate,
  formatDateTime,
  formatNumber,
  formatShortName,
} from "@/lib/format";

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

describe("displayDayRange", () => {
  it("spans a summer day in Kyiv (UTC+3)", () => {
    expect(displayDayRange("2026-09-14")).toEqual({
      start: new Date("2026-09-13T21:00:00Z"),
      end: new Date("2026-09-14T21:00:00Z"),
    });
  });

  it("spans a winter day in Kyiv (UTC+2)", () => {
    expect(displayDayRange("2026-01-15")).toEqual({
      start: new Date("2026-01-14T22:00:00Z"),
      end: new Date("2026-01-15T22:00:00Z"),
    });
  });

  it("is 23 hours long on the day clocks go forward", () => {
    expect(displayDayRange("2026-03-29")).toEqual({
      start: new Date("2026-03-28T22:00:00Z"),
      end: new Date("2026-03-29T21:00:00Z"),
    });
  });

  it("rolls over the end of a month", () => {
    expect(displayDayRange("2026-12-31")?.end).toEqual(new Date("2026-12-31T22:00:00Z"));
  });

  it("rejects values that are not real dates", () => {
    for (const value of ["", "2026-02-30", "2026-13-01", "14.09.2026", "0002-09-14"]) {
      expect(displayDayRange(value)).toBeNull();
    }
  });
});

describe("formatShortName", () => {
  it("keeps the surname and shortens the other names to initials", () => {
    expect(formatShortName("Иванов Иван Иванович")).toBe("Иванов И. И.");
  });

  it("leaves a single word and extra spaces alone", () => {
    expect(formatShortName(" Петров ")).toBe("Петров");
    expect(formatShortName("Петров   пётр")).toBe("Петров П.");
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
