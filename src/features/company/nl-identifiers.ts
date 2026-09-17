// Formats of Dutch registration and tax numbers, postcodes, phones and web addresses
// (docs/ТЗ.md, 5.4 and 5.5). Every normalize* function returns its own result unchanged,
// because the form and the server action both parse the same values.

/** Spaces and dots are separators people copy from letters and extracts. */
export function normalizeIdentifier(value: string): string {
  return value.replace(/[\s.]/g, "").toUpperCase();
}

export function isKvkNumber(value: string): boolean {
  return /^\d{8}$/.test(value);
}

export function isEstablishmentNumber(value: string): boolean {
  return /^\d{12}$/.test(value);
}

export function isRsinFormat(value: string): boolean {
  return /^\d{9}$/.test(value);
}

const ELFPROEF_WEIGHTS = [9, 8, 7, 6, 5, 4, 3, 2, -1];

/** The "elfproef" of a 9-digit RSIN: the weighted sum of the digits is divisible by 11. */
export function passesElfproef(value: string): boolean {
  if (!isRsinFormat(value)) return false;

  const sum = [...value].reduce(
    (total, digit, i) => total + Number(digit) * ELFPROEF_WEIGHTS[i],
    0,
  );
  return sum % 11 === 0;
}

/**
 * A btw-id or an omzetbelastingnummer. Only the format is checked: numbers issued since 2020
 * use a different check digit algorithm, and rejecting a valid number is worse than a typo.
 */
export function isVatNumber(value: string): boolean {
  return /^NL\d{9}B\d{2}$/.test(value);
}

export function isPayrollTaxNumber(value: string): boolean {
  return /^\d{9}L\d{2}$/.test(value);
}

/**
 * Collapses whitespace and brings a Dutch-looking postcode to the stored form "1234 AB".
 * Postcodes of other countries keep their case and spacing.
 */
export function normalizePostcode(value: string): string {
  const collapsed = value.trim().replace(/\s+/g, " ");
  const dutch = /^(\d{4}) ?([a-z]{2})$/i.exec(collapsed);
  return dutch ? `${dutch[1]} ${dutch[2].toUpperCase()}` : collapsed;
}

/** SA, SD and SS are not issued as postcode letters. */
export function isDutchPostcode(value: string): boolean {
  const match = /^[1-9]\d{3} ([A-Z]{2})$/.exec(value);
  return match !== null && !["SA", "SD", "SS"].includes(match[1]);
}

/**
 * Brings a phone number typed with spaces, dashes and brackets to the international form
 * "+31684614732": "00" becomes "+", and a single leading "0" means a Dutch number.
 */
export function normalizePhone(value: string): string {
  const compact = value.replace(/[\s()-]/g, "");
  if (compact.startsWith("00")) return `+${compact.slice(2)}`;
  if (compact.startsWith("0")) return `+31${compact.slice(1)}`;
  return compact;
}

/** A normalized phone: "+", a country code that does not start with 0, 9 to 15 digits in all. */
export function isPhone(value: string): boolean {
  return /^\+[1-9]\d{8,14}$/.test(value);
}

function parseWebUrl(value: string): URL | null {
  if (/\s/.test(value)) return null;

  try {
    const url = new URL(value);
    // A host without a dot ("https://intranet") is not a public web address.
    return /^[^.]+(\.[^.]+)+$/.test(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

/**
 * The URL a website value opens: stored as typed, with or without http(s)://.
 * Null for any other scheme ("javascript:", "ftp:") and for values that are not web addresses.
 */
export function websiteUrl(value: string): URL | null {
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    return /^https?:\/\/[^/]/i.test(value) ? parseWebUrl(value) : null;
  }
  // Without a scheme the value must start with the host, not with "//" or a path.
  return /^[\p{L}\p{N}]/u.test(value) ? parseWebUrl(`https://${value}`) : null;
}

export function isWebsite(value: string): boolean {
  return websiteUrl(value) !== null;
}

/** Social network links are accepted only as full https:// addresses. */
export function isHttpsUrl(value: string): boolean {
  return /^https:\/\/[^/]/i.test(value) && parseWebUrl(value) !== null;
}
