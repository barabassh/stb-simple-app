import { describe, expect, it } from "vitest";

import { formatAddress } from "@/features/company/address";

describe("formatAddress", () => {
  it("writes a Dutch address in the Dutch order without the country", () => {
    expect(
      formatAddress(
        {
          street: "de Geerenweg",
          houseNumber: 4,
          houseNumberAddition: "E",
          postcode: "3741 RS",
          city: "Baarn",
          country: "NL",
        },
        "ru",
      ),
    ).toBe("de Geerenweg 4 E, 3741 RS Baarn");
  });

  it("names the country of a foreign address in the interface language", () => {
    expect(
      formatAddress(
        {
          street: "Rue Neuve",
          houseNumber: "1",
          postcode: "1000",
          city: "Bruxelles",
          country: "BE",
        },
        "ru",
      ),
    ).toBe("Rue Neuve 1, 1000 Bruxelles, Бельгия");
  });

  it("writes a PO box as Postbus", () => {
    expect(
      formatAddress(
        { postbus: "1234", postcode: "1000 AB", city: "Amsterdam", country: "NL" },
        "ru",
      ),
    ).toBe("Postbus 1234, 1000 AB Amsterdam");
  });
});
