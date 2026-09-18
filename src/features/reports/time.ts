import { formatDecimal } from "@/lib/format";

// A report's time is the worker's wall clock in whole minutes from midnight, without a time zone
// (docs/СХЕМА-БД.md, 10.4). Hours are shown as a decimal number rounded from the sum of minutes,
// so a total equals the sum of its minutes, not of its rounded rows (docs/ТЗ.md, 7.5).

export const MINUTES_PER_DAY = 24 * 60;

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
  const hundredths = (halfUp - (halfUp % 60)) / 60;
  const whole = (hundredths - (hundredths % 100)) / 100;
  return formatDecimal(`${whole}.${String(hundredths % 100).padStart(2, "0")}`, {
    minimumFractionDigits: 2,
  });
}
