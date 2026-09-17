// Countries offered for addresses (docs/ТЗ.md, 5.4). Stored as ISO 3166-1 alpha-2 codes;
// names come from Intl.DisplayNames, so new interface languages need no translations here.

export const DEFAULT_COUNTRY = "NL";

const EU_COUNTRIES = [
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
] as const;

export const COUNTRY_CODES = [DEFAULT_COUNTRY, ...EU_COUNTRIES, "GB", "CH", "NO", "UA"] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];

export function countryName(code: string, locale: string): string {
  return new Intl.DisplayNames([locale], { type: "region", fallback: "code" }).of(code) ?? code;
}

/** The Netherlands first, the rest alphabetically by name in the given language. */
export function countryOptions(locale: string): { code: CountryCode; name: string }[] {
  const collator = new Intl.Collator(locale);
  const [first, ...rest] = COUNTRY_CODES.map((code) => ({ code, name: countryName(code, locale) }));
  return [first, ...rest.sort((a, b) => collator.compare(a.name, b.name))];
}
