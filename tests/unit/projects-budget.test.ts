import { describe, expect, it } from "vitest";

import { budgetWithVat, fromCents, parseDecimalInput, toCents } from "@/features/projects/budget";

const AMOUNT_DIGITS = 12;

describe("parseDecimalInput", () => {
  it.each([
    ["12500,5", "12500.50"],
    ["12500.5", "12500.50"],
    ["12.500,50", "12500.50"],
    ["12,500.50", "12500.50"],
    ["12 500,5", "12500.50"],
    ["1 250 000", "1250000.00"],
    ["1.250.000", "1250000.00"],
    ["0,05", "0.05"],
    ["007", "7.00"],
    ["12,", "12.00"],
  ])("reads %j as %j", (input, expected) => {
    expect(parseDecimalInput(input, AMOUNT_DIGITS)).toBe(expected);
  });

  it("reads a non-breaking space as a thousands separator", () => {
    expect(parseDecimalInput(`12${String.fromCharCode(160)}500,50`, AMOUNT_DIGITS)).toBe(
      "12500.50",
    );
  });

  it.each([
    ["-12500", "a negative amount"],
    ["12500,505", "three decimals"],
    ["12.500", "a single separator before three digits is ambiguous"],
    ["12,500", "a single separator before three digits is ambiguous"],
    ["1.25.000", "groups that are not three digits"],
    ["", "an empty value"],
    [",50", "no whole part"],
    ["12 500 EUR", "letters"],
    ["1234567890123", "more digits than the column holds"],
  ])("rejects %j: %s", (input) => {
    expect(parseDecimalInput(input, AMOUNT_DIGITS)).toBeNull();
  });

  it("limits the whole part of hours separately", () => {
    expect(parseDecimalInput("99999999,99", 8)).toBe("99999999.99");
    expect(parseDecimalInput("100000000", 8)).toBeNull();
  });
});

describe("cents", () => {
  it("converts both ways without floating point arithmetic", () => {
    expect(toCents("12500.50")).toBe(BigInt(1250050));
    expect(toCents("0.05")).toBe(BigInt(5));
    expect(fromCents(BigInt(1512561))).toBe("15125.61");
    expect(fromCents(BigInt(5))).toBe("0.05");
  });
});

describe("budgetWithVat", () => {
  it.each([
    ["STANDARD_21" as const, "15125.61"],
    ["REDUCED_9" as const, "13625.55"],
    ["ZERO" as const, "12500.50"],
    ["REVERSE_CHARGE" as const, "12500.50"],
  ])("adds %s VAT", (vatRate, expected) => {
    expect(budgetWithVat("12500.50", vatRate)).toBe(expected);
  });

  it("rounds half a cent up", () => {
    // 0,10 × 1,21 = 0,121 → 0,13 is wrong, 0,12 is the half-up result of 12,1 cents.
    expect(budgetWithVat("0.10", "STANDARD_21")).toBe("0.12");
    // 0,50 × 1,09 = 0,545 → exactly half a cent, rounded up.
    expect(budgetWithVat("0.50", "REDUCED_9")).toBe("0.55");
  });

  it("keeps a budget that exceeds the precision of a double", () => {
    expect(budgetWithVat("999999999999.99", "STANDARD_21")).toBe("1209999999999.99");
  });
});
