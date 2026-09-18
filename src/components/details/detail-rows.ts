// The rows a card shows as "name — value": the company profile (docs/ТЗ.md, 5.6), a customer and
// a contractor (6.4–6.5). The section builds the rows, this module only says what a row may hold.

/** Null reads as "not set". An external link opens in a new tab. */
export type DetailValue =
  | { type: "text"; text: string }
  | { type: "link"; text: string; href: string; external: boolean }
  | null;

export type DetailRow = {
  key: string;
  label: string;
  value: DetailValue;
  /** A mark next to the value, such as the main activity's. */
  badge?: string;
};

export type DetailGroup = {
  key: string;
  /** Left out when the card shows a single group, e.g. on a tab of its own. */
  title?: string;
  rows: DetailRow[];
};

export const detailText = (value: string | null | undefined): DetailValue =>
  value ? { type: "text", text: value } : null;

export const detailEmail = (value: string | null | undefined): DetailValue =>
  value ? { type: "link", text: value, href: `mailto:${value}`, external: false } : null;

export const detailPhone = (value: string | null | undefined): DetailValue =>
  value ? { type: "link", text: value, href: `tel:${value}`, external: false } : null;
