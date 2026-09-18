import { describe, expect, it } from "vitest";

import { formatHours, formatTime, parseTime, workedMinutes } from "@/features/reports/time";

describe("parseTime", () => {
  it.each([
    ["00:00", 0],
    ["08:30", 510],
    ["8:30", 510],
    [" 16:05 ", 965],
    ["23:59", 1439],
  ])("reads %s as %i minutes", (value, minutes) => {
    expect(parseTime(value)).toBe(minutes);
  });

  it.each(["24:00", "25:10", "08:60", "0830", "08.30", "8:5", "", "08:30:00", "-1:00"])(
    "rejects %j",
    (value) => {
      expect(parseTime(value)).toBeNull();
    },
  );
});

describe("formatTime", () => {
  it.each([
    [0, "00:00"],
    [510, "08:30"],
    [965, "16:05"],
    [1439, "23:59"],
  ])("shows %i minutes as %s", (minutes, value) => {
    expect(formatTime(minutes)).toBe(value);
  });
});

describe("workedMinutes and formatHours", () => {
  const hours = (start: string, end: string, lunchMinutes: number) =>
    formatHours(
      workedMinutes({
        startMinute: parseTime(start) ?? NaN,
        endMinute: parseTime(end) ?? NaN,
        lunchMinutes,
      }),
    );

  it("subtracts the lunch: 08:00–16:30 with 30 minutes is 8,00", () => {
    expect(hours("08:00", "16:30", 30)).toBe("8,00");
  });

  it("rounds 7 hours 5 minutes to 7,08", () => {
    expect(hours("08:00", "15:05", 0)).toBe("7,08");
  });

  // A whole number of minutes is never exactly halfway between two hundredths of an hour.
  it("rounds to the nearest hundredth", () => {
    expect(formatHours(1)).toBe("0,02");
    expect(formatHours(2)).toBe("0,03");
    expect(formatHours(3)).toBe("0,05");
    expect(formatHours(45)).toBe("0,75");
    expect(formatHours(59)).toBe("0,98");
  });

  it("rounds a total from the sum of minutes: 20 + 20 minutes is 0,67, not 0,33 + 0,33", () => {
    expect(formatHours(20)).toBe("0,33");
    expect(formatHours(20 + 20)).toBe("0,67");
  });

  it("groups the digits of a large total", () => {
    expect(formatHours(123_456 * 60 + 30)).toBe("123\u00A0456,50");
  });

  it("shows zero as 0,00", () => {
    expect(formatHours(0)).toBe("0,00");
  });

  it.each([-1, 1.5, NaN])("rejects %s minutes", (minutes) => {
    expect(() => formatHours(minutes)).toThrow(RangeError);
  });
});
