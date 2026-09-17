import { displayTodayIso } from "@/lib/format";

// The duration of a project is a day counter, not a stored field (docs/ТЗ.md, 6.6).

const DAY_MS = 24 * 60 * 60 * 1000;

type DurationInput = {
  /** A calendar date (`@db.Date`), read in UTC like every date without a time. */
  startDate: Date;
  /** The instant a closed project was closed; the counter stops at its Europe/Kyiv date. */
  closedAt?: Date | null;
};

/**
 * Whole days from the start date up to and including today in Europe/Kyiv — a project started
 * today lasts one day. Null while the start date has not come yet ("not started").
 */
export function projectDuration(
  { startDate, closedAt }: DurationInput,
  now: Date | number = Date.now(),
): number | null {
  const start = startDate.toISOString().slice(0, 10);
  const end = displayTodayIso(closedAt ?? now);
  if (end < start) return null;

  return (
    Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1
  );
}
