import type { VatRate } from "@/generated/prisma/enums";

// Money and hours are counted in whole cents and hundredths, never as floating point numbers
// (docs/АРХИТЕКТУРА.md, 3.9): a budget rounded through a double would drift by a cent.

const SCALE = 2;

// BigInt literals need a newer compilation target than the project uses.
const HUNDRED = BigInt(100);
const HALF_CENT = BigInt(50);

const VAT_PERCENT: Record<VatRate, number> = {
  STANDARD_21: 21,
  REDUCED_9: 9,
  ZERO: 0,
  // "Verlegd": the VAT is accounted for by the customer, so the total equals the net amount.
  REVERSE_CHARGE: 0,
};

const SPACES = /[\s  ]/g;

type AmountParts = { whole: string; fraction: string; groupSeparator: string | null };

/**
 * Splits a typed amount into its whole and fractional parts. Both "," and "." are accepted as the
 * decimal separator: the rightmost one separates the cents, the other groups the thousands. A
 * single separator followed by exactly three digits ("12.500") is ambiguous and rejected — the
 * user means either 12,50 or 12 500, and guessing would silently change a budget.
 */
function amountParts(value: string): AmountParts | null {
  const comma = value.lastIndexOf(",");
  const dot = value.lastIndexOf(".");

  if (comma >= 0 && dot >= 0) {
    const decimalAt = Math.max(comma, dot);
    return {
      whole: value.slice(0, decimalAt),
      fraction: value.slice(decimalAt + 1),
      groupSeparator: comma > dot ? "." : ",",
    };
  }

  const separator = comma >= 0 ? "," : dot >= 0 ? "." : null;
  if (separator === null) return { whole: value, fraction: "", groupSeparator: null };

  const parts = value.split(separator);
  if (parts.length > 2) return { whole: value, fraction: "", groupSeparator: separator };
  if (parts[1].length === 3) return null;
  return { whole: parts[0], fraction: parts[1], groupSeparator: null };
}

function wholeDigits(whole: string, groupSeparator: string | null): string | null {
  if (groupSeparator === null) return /^\d+$/.test(whole) ? whole : null;

  const groups = whole.split(groupSeparator);
  const grouped = groups.every(
    (group, index) => /^\d+$/.test(group) && (index === 0 ? group.length <= 3 : group.length === 3),
  );
  return grouped ? groups.join("") : null;
}

/**
 * A non-negative amount typed with a comma or a dot and optional thousand separators, as the exact
 * decimal string a `Decimal` column stores: "12 500,5" → "12500.50". Null for anything else,
 * including negative values, more than two decimals and more than `maxWholeDigits` before them.
 */
export function parseDecimalInput(input: string, maxWholeDigits: number): string | null {
  const value = input.replace(SPACES, "");
  if (!/^[\d.,]+$/.test(value)) return null;

  const parts = amountParts(value);
  if (parts === null || !/^\d{0,2}$/.test(parts.fraction)) return null;

  const digits = wholeDigits(parts.whole, parts.groupSeparator);
  if (digits === null) return null;

  const whole = digits.replace(/^0+(?=\d)/, "");
  if (whole.length > maxWholeDigits) return null;

  return `${whole}.${parts.fraction.padEnd(SCALE, "0")}`;
}

/** An exact decimal string as whole cents. */
export function toCents(amount: string): bigint {
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * HUNDRED + BigInt(fraction.padEnd(SCALE, "0").slice(0, SCALE));
}

export function fromCents(cents: bigint): string {
  const digits = cents.toString().padStart(SCALE + 1, "0");
  return `${digits.slice(0, -SCALE)}.${digits.slice(-SCALE)}`;
}

/**
 * The budget including VAT (docs/ТЗ.md, 6.6), rounded to the cent half up. Calculated on every
 * screen and export instead of being stored, so that it cannot disagree with the net amount.
 */
export function budgetWithVat(amount: string, vatRate: VatRate): string {
  const cents = toCents(amount);
  const percent = BigInt(100 + VAT_PERCENT[vatRate]);
  return fromCents((cents * percent + HALF_CENT) / HUNDRED);
}
