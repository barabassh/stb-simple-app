import { describe, expect, it } from "vitest";

import { COUNTRY_CODES, countryName, countryOptions } from "@/features/company/countries";

describe("company countries", () => {
  it("offers the Netherlands, the other 26 EU members, GB, CH, NO and UA", () => {
    expect(COUNTRY_CODES).toHaveLength(31);
    expect(new Set(COUNTRY_CODES).size).toBe(31);
    expect(COUNTRY_CODES).toEqual(
      expect.arrayContaining(["NL", "BE", "DE", "GB", "CH", "NO", "UA"]),
    );
  });

  it("names a country in the interface language", () => {
    expect(countryName("NL", "ru")).toBe("Нидерланды");
    expect(countryName("DE", "en")).toBe("Germany");
  });

  it("puts the Netherlands first and sorts the rest by name", () => {
    const names = countryOptions("ru").map((option) => option.name);

    expect(names[0]).toBe("Нидерланды");
    expect(names.slice(1)).toEqual([...names.slice(1)].sort(new Intl.Collator("ru").compare));
    expect(names[1]).toBe("Австрия");
  });

  it("sorts by the names of the given language", () => {
    expect(countryOptions("en")[1].code).toBe("AT");
    expect(countryOptions("en").at(-1)?.code).toBe("GB");
  });
});
