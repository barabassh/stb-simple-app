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
