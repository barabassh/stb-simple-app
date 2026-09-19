import { formatDecimal } from "@/lib/format";

// A report's time is the worker's wall clock in whole minutes from midnight, without a time zone
// (docs/СХЕМА-БД.md, 10.4). Hours are shown as a decimal number rounded from the sum of minutes,
// so a total equals the sum of its minutes, not of its rounded rows (docs/ТЗ.md, 7.5).

export const MINUTES_PER_DAY = 24 * 60;

// BigInt literals need a newer compilation target than the project uses.
const [ZERO, TWO, THREE, FIVE, SIX, HUNDRED, THOUSAND] = [0, 2, 3, 5, 6, 100, 1000].map(BigInt);

/** "08:30" → 510. A one-digit hour is accepted; "24:00" and anything else is not a time: null. */
export function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  return hours < 24 ? hours * 60 + Number(match[2]) : null;
}

/** 510 → "08:30". */
export function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** A length of time as hours and minutes: 60 → "1:00", 30 → "0:30", 90 → "1:30". */
export function formatDuration(minutes: number): string {
  if (!Number.isSafeInteger(minutes) || minutes < 0) {
    throw new RangeError(`Not a number of minutes: ${minutes}`);
  }
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

export const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** The day of the week of a report's calendar day, stored as midnight UTC (docs/СХЕМА-БД.md, 10.4). */
export function weekdayOf(workDate: Date): Weekday {
  return WEEKDAYS[workDate.getUTCDay()];
}

export type WorkTime = { startMinute: number; endMinute: number; lunchMinutes: number };

export function workedMinutes({ startMinute, endMinute, lunchMinutes }: WorkTime): number {
  return endMinute - startMinute - lunchMinutes;
}

/**
 * Minutes as hours with two decimals in the app's number format: 450 → "7,50", 425 → "7,08",
 * 40 → "0,67". Rounded half up in whole hundredths of an hour, so no floating point is involved.
 */
export function formatHours(minutes: number): string {
  if (!Number.isSafeInteger(minutes) || minutes < 0) {
    throw new RangeError(`Not a number of minutes: ${minutes}`);
  }
  const halfUp = minutes * 100 + 30;
  return formatHundredths(BigInt((halfUp - (halfUp % 60)) / 60));
}

function formatHundredths(hundredths: bigint): string {
  const fraction = String(hundredths % HUNDRED).padStart(2, "0");
  return formatDecimal(`${hundredths / HUNDRED}.${fraction}`, { minimumFractionDigits: 2 });
}

export type HoursBudgetUse =
  | { exceeded: false; percent: number }
  /** By how much, as formatHours shows hours. */
  | { exceeded: true; excess: string };

/**
 * The approved minutes against a project's budget of hours, an exact decimal string such as
 * "500.00" (docs/ТЗ.md, 7.11). Counted in whole units rather than floating point: the minutes are
 * 5/3 of hundredths of an hour, so the excess rounds half up exactly as the two totals shown do, and
 * the share used rounds half up to a whole percent. Over by less than the last hundredth shown, the
 * budget reads as used 100 %, however small it is.
 */
export function hoursBudgetUse(minutes: number, budgetHours: string): HoursBudgetUse {
  const match = /^(\d+)\.(\d{2})$/.exec(budgetHours);
  if (!match || !Number.isSafeInteger(minutes) || minutes < 0) {
    throw new RangeError(`Not a budget of hours or minutes: ${budgetHours}, ${minutes}`);
  }
  const budget = BigInt(match[1] + match[2]);
  const used = BigInt(minutes);

  // Thirds of a hundredth of an hour over the budget, rounded half up to hundredths.
  const overThirds = FIVE * used - THREE * budget;
  const excess = overThirds > ZERO ? (TWO * overThirds + THREE) / SIX : ZERO;
  if (excess > ZERO) return { exceeded: true, excess: formatHundredths(excess) };
  if (budget === ZERO) return { exceeded: false, percent: 0 };

  // (used / 60) / (budget / 100) · 100 = 500 · used / (3 · budget), rounded half up.
  const percent = (THOUSAND * used + THREE * budget) / (SIX * budget);
  return { exceeded: false, percent: Math.min(100, Number(percent)) };
}
