import { describe, expect, it } from "vitest";

import {
  formatDuration,
  formatHours,
  formatTime,
  hoursBudgetUse,
  parseTime,
  weekdayOf,
  workedMinutes,
} from "@/features/reports/time";

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

describe("hoursBudgetUse", () => {
  it.each([
    [7230, "500.00", 24],
    [30000, "500.00", 100],
    [150, "4.00", 63],
    [0, "0.00", 0],
    [0, "500.00", 0],
  ])("counts %i minutes as used of %s hours in whole percent", (minutes, budget, percent) => {
    expect(hoursBudgetUse(minutes, budget)).toEqual({ exceeded: false, percent });
  });

  it.each([
    [30750, "500.00", "12,50"],
    [1, "0.00", "0,02"],
    [30001, "500.00", "0,02"],
  ])("tells how far %i minutes are over %s hours", (minutes, budget, excess) => {
    expect(hoursBudgetUse(minutes, budget)).toEqual({ exceeded: true, excess });
  });

  it("agrees with the hours shown when over by less than a hundredth", () => {
    // 2 minutes are shown as 0,03 hours, like the budget: used, not exceeded.
    expect(formatHours(2)).toBe("0,03");
    expect(hoursBudgetUse(2, "0.03")).toEqual({ exceeded: false, percent: 100 });
  });

  it.each(["500", "500.5", "-1.00", "1,00"])("rejects the budget %j", (budget) => {
    expect(() => hoursBudgetUse(60, budget)).toThrow(RangeError);
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0:00"],
    [5, "0:05"],
    [30, "0:30"],
    [60, "1:00"],
    [90, "1:30"],
    [615, "10:15"],
  ])("shows %i minutes as %s", (minutes, value) => {
    expect(formatDuration(minutes)).toBe(value);
  });

  it.each([-1, 1.5])("rejects %d", (minutes) => {
    expect(() => formatDuration(minutes)).toThrow(RangeError);
  });
});

describe("weekdayOf", () => {
  it.each([
    ["2026-09-14", "monday"],
    ["2026-09-16", "wednesday"],
    ["2026-09-19", "saturday"],
    ["2026-09-20", "sunday"],
  ])("tells %s is a %s", (day, weekday) => {
    expect(weekdayOf(new Date(`${day}T00:00:00Z`))).toBe(weekday);
  });
});
