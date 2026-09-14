export const DISPLAY_TIME_ZONE = "Europe/Kyiv";

type DateInput = Date | string | number;

// Parts are assembled by hand: locale presets differ between ICU versions
// (e.g. "14.09.2026, 11:20"), while the required format is fixed.
const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: DISPLAY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function toParts(value: DateInput) {
  const parts = dateTimeFormatter.formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return {
    day: part("day"),
    month: part("month"),
    year: part("year"),
    hour: part("hour"),
    minute: part("minute"),
  };
}

/** `dd.MM.yyyy` in Europe/Kyiv. Empty string for null/undefined. */
export function formatDate(value: DateInput | null | undefined): string {
  if (value == null) return "";
  const { day, month, year } = toParts(value);
  return `${day}.${month}.${year}`;
}

/** `dd.MM.yyyy HH:mm` in Europe/Kyiv. Empty string for null/undefined. */
export function formatDateTime(value: DateInput | null | undefined): string {
  if (value == null) return "";
  const { day, month, year, hour, minute } = toParts(value);
  return `${day}.${month}.${year} ${hour}:${minute}`;
}

/** Difference between the wall clock in Europe/Kyiv and UTC at the given instant, in ms. */
function displayOffsetAt(instant: number): number {
  const { day, month, year, hour, minute } = toParts(instant);
  const wallClock = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
  return wallClock - Math.floor(instant / 60_000) * 60_000;
}

function startOfDisplayDay(year: number, monthIndex: number, day: number): Date {
  const midnight = Date.UTC(year, monthIndex, day);
  // Measured again at the first estimate, in case the offset changes between the two instants.
  const estimate = midnight - displayOffsetAt(midnight);
  return new Date(midnight - displayOffsetAt(estimate));
}

/**
 * The UTC instants a calendar day (`yyyy-MM-dd`, as a date input gives it) starts and ends in
 * Europe/Kyiv, for filtering stored timestamps by the dates a user picks. The end is exclusive.
 * Null for anything that is not a real date.
 */
export function displayDayRange(value: string): { start: Date; end: Date } | null {
  const match = /^([1-9]\d{3})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const [year, monthIndex, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const date = new Date(Date.UTC(year, monthIndex, day));
  if (date.getUTCMonth() !== monthIndex || date.getUTCDate() !== day) return null;

  return {
    start: startOfDisplayDay(year, monthIndex, day),
    end: startOfDisplayDay(year, monthIndex, day + 1),
  };
}

/** "Иванов Иван Иванович" → "Иванов И. И.": the first name in full, the rest as initials. */
export function formatShortName(fullName: string): string {
  const [first = "", ...rest] = fullName.trim().split(/\s+/);
  return [first, ...rest.map((name) => `${name.charAt(0).toLocaleUpperCase("ru")}.`)].join(" ");
}

export type NumberFormatOptions = {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

const NBSP = " ";

/** Groups digits with a non-breaking space and uses a comma as the decimal separator. */
export function formatNumber(
  value: number | null | undefined,
  { minimumFractionDigits = 0, maximumFractionDigits = 2 }: NumberFormatOptions = {},
): string {
  if (value == null) return "";

  // en-US is used only as a stable source of parts; separators are replaced below.
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits,
    maximumFractionDigits,
    useGrouping: "always",
  })
    .formatToParts(value)
    .map((p) => {
      if (p.type === "group") return NBSP;
      if (p.type === "decimal") return ",";
      return p.value;
    })
    .join("");
}
