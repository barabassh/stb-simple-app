import { describe, expect, it } from "vitest";

import {
  isDutchPostcode,
  isEstablishmentNumber,
  isHttpsUrl,
  isKvkNumber,
  isPayrollTaxNumber,
  isPhone,
  isRsinFormat,
  isVatNumber,
  isWebsite,
  normalizeIdentifier,
  normalizePhone,
  normalizePostcode,
  passesElfproef,
  websiteUrl,
} from "@/lib/nl/identifiers";

describe("normalizeIdentifier", () => {
  it("removes spaces and dots and upper-cases letters", () => {
    expect(normalizeIdentifier("nl 0050.25949.b57")).toBe("NL005025949B57");
    expect(normalizeIdentifier(" 1234 5678 ")).toBe("12345678");
  });

  it("keeps a normalized value unchanged", () => {
    expect(normalizeIdentifier("123456789L01")).toBe("123456789L01");
  });
});

describe("KvK-nummer and vestigingsnummer", () => {
  it("accepts exactly 8 and 12 digits", () => {
    expect(isKvkNumber("12345678")).toBe(true);
    expect(isEstablishmentNumber("000012345678")).toBe(true);
  });

  it.each(["1234567", "123456789", "1234567A"])("rejects the KvK-nummer %j", (value) => {
    expect(isKvkNumber(value)).toBe(false);
  });

  it.each(["12345678901", "1234567890123", "12345678901A"])(
    "rejects the vestigingsnummer %j",
    (value) => {
      expect(isEstablishmentNumber(value)).toBe(false);
    },
  );
});

describe("RSIN", () => {
  it("passes the elfproef for a valid number", () => {
    // 9·1 + 8·1 + 7·1 + 6·2 + 5·2 + 4·2 + 3·3 + 2·3 − 1·3 = 66
    expect(passesElfproef("111222333")).toBe(true);
  });

  it("fails the elfproef when one digit is wrong", () => {
    expect(isRsinFormat("111222334")).toBe(true);
    expect(passesElfproef("111222334")).toBe(false);
  });

  it("treats the last digit with weight −1", () => {
    // 9·1 + 2·(−1) = 7 with weight +1 would be 11, a false pass
    expect(passesElfproef("100000002")).toBe(false);
  });

  it.each(["11122233", "1112223330", "11122233A"])("rejects the format %j", (value) => {
    expect(isRsinFormat(value)).toBe(false);
    expect(passesElfproef(value)).toBe(false);
  });
});

describe("btw-id and omzetbelastingnummer", () => {
  it("accepts NL, 9 digits, B and 2 digits", () => {
    expect(isVatNumber("NL005025949B57")).toBe(true);
  });

  it.each(["NL005025949057", "NL00502594B57", "BE005025949B57", "NL005025949B5"])(
    "rejects %j",
    (value) => {
      expect(isVatNumber(value)).toBe(false);
    },
  );
});

describe("loonheffingennummer", () => {
  it("accepts 9 digits, L and 2 digits", () => {
    expect(isPayrollTaxNumber("123456789L01")).toBe(true);
  });

  it.each(["123456789B01", "12345678L01", "123456789L1"])("rejects %j", (value) => {
    expect(isPayrollTaxNumber(value)).toBe(false);
  });
});

describe("Dutch postcode", () => {
  it.each([
    ["3741rs", "3741 RS"],
    ["3741 rs", "3741 RS"],
    ["  3741   RS ", "3741 RS"],
    ["3741 RS", "3741 RS"],
  ])("normalizes %j to %j", (value, normalized) => {
    expect(normalizePostcode(value)).toBe(normalized);
    expect(isDutchPostcode(normalizePostcode(value))).toBe(true);
  });

  it.each(["0123 AB", "1234 SA", "1234 SD", "1234 SS", "123 AB", "12345 AB", "1234 A1"])(
    "rejects %j",
    (value) => {
      expect(isDutchPostcode(normalizePostcode(value))).toBe(false);
    },
  );

  it("leaves postcodes of other countries as typed, apart from extra spaces", () => {
    expect(normalizePostcode(" sw1a  1aa ")).toBe("sw1a 1aa");
    expect(normalizePostcode("00-950")).toBe("00-950");
  });
});

describe("phone", () => {
  it.each([
    ["06 84 61 47 32", "+31684614732"],
    ["0031 6 84614732", "+31684614732"],
    ["+31684614732", "+31684614732"],
    ["+31 35-541 23 45", "+31355412345"],
    ["(035) 541-23-45", "+31355412345"],
    ["+49 30 123456", "+4930123456"],
  ])("normalizes %j to %j", (value, normalized) => {
    expect(normalizePhone(value)).toBe(normalized);
    expect(isPhone(normalizePhone(value))).toBe(true);
  });

  it.each([
    ["0612345", "too few digits"],
    ["+3168461473212345", "too many digits"],
    ["684614732", "no country code"],
    ["000684614732", "a country code starting with 0"],
    ["06 8461 47 3x", "a letter"],
    ["+31 6+84614732", "a plus sign inside"],
  ])("rejects %j (%s)", (value) => {
    expect(isPhone(normalizePhone(value))).toBe(false);
  });
});

describe("website", () => {
  it.each([
    "www.SmartZaken.nl",
    "SmartZaken.nl",
    "https://www.smartzaken.nl/contact",
    "http://smartzaken.nl",
  ])("accepts %j", (value) => {
    expect(isWebsite(value)).toBe(true);
  });

  it("opens a value without a scheme over https", () => {
    expect(websiteUrl("www.SmartZaken.nl")?.href).toBe("https://www.smartzaken.nl/");
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "ftp://smartzaken.nl",
    "data:text/html,<script>alert(1)</script>",
    "//smartzaken.nl",
    "https://localhost",
    "smart zaken.nl",
    "smartzaken",
  ])("rejects %j", (value) => {
    expect(isWebsite(value)).toBe(false);
  });
});

describe("social network link", () => {
  it("accepts an https address", () => {
    expect(isHttpsUrl("https://www.linkedin.com/company/smartzaken")).toBe(true);
  });

  it.each([
    "http://www.linkedin.com/company/x",
    "www.linkedin.com/company/x",
    "javascript:alert(1)",
  ])("rejects %j", (value) => {
    expect(isHttpsUrl(value)).toBe(false);
  });
});
