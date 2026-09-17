import { countryName, DEFAULT_COUNTRY } from "./countries";

export type AddressParts = {
  street?: string | null;
  houseNumber?: string | number | null;
  houseNumberAddition?: string | null;
  postbus?: string | null;
  postcode?: string | null;
  city?: string | null;
  country: string;
};

/**
 * One line in the Dutch order (docs/ТЗ.md, 5.4): "de Geerenweg 4 E, 3741 RS Baarn", or
 * "Postbus 1234, 1000 AB Amsterdam" for a PO box. "Postbus" is part of the address itself, as
 * the post expects it, not an interface text. The country is added only outside the Netherlands.
 */
export function formatAddress(address: AddressParts, locale: string): string {
  const firstLine = address.postbus
    ? `Postbus ${address.postbus}`
    : [address.street, address.houseNumber, address.houseNumberAddition]
        .filter((part) => part != null && part !== "")
        .join(" ");
  const place = [address.postcode, address.city].filter(Boolean).join(" ");
  const country = address.country === DEFAULT_COUNTRY ? "" : countryName(address.country, locale);

  return [firstLine, place, country].filter(Boolean).join(", ");
}
