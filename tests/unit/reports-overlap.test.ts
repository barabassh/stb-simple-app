import { describe, expect, it } from "vitest";

import { findOverlaps, intervalsOverlap, type ReportInterval } from "@/features/reports/overlap";
import { parseTime } from "@/features/reports/time";

const interval = (
  start: string,
  end: string,
  { userId = "ivan", workDate = "2026-09-18" } = {},
): ReportInterval => ({
  userId,
  workDate,
  startMinute: parseTime(start) ?? NaN,
  endMinute: parseTime(end) ?? NaN,
});

describe("intervalsOverlap", () => {
  it.each([
    ["08:00", "12:00", "11:00", "15:00"],
    ["08:00", "16:00", "10:00", "11:00"],
    ["08:00", "12:00", "08:00", "12:00"],
    ["08:00", "12:00", "07:00", "08:01"],
  ])("%s–%s overlaps %s–%s", (aStart, aEnd, bStart, bEnd) => {
    const a = interval(aStart, aEnd);
    const b = interval(bStart, bEnd);
    expect(intervalsOverlap(a, b)).toBe(true);
    expect(intervalsOverlap(b, a)).toBe(true);
  });

  it("does not count reports that meet: 08:00–12:00 and 12:00–16:00", () => {
    expect(intervalsOverlap(interval("08:00", "12:00"), interval("12:00", "16:00"))).toBe(false);
    expect(intervalsOverlap(interval("12:00", "16:00"), interval("08:00", "12:00"))).toBe(false);
  });

  it("compares only the reports of one worker on one day", () => {
    const report = interval("08:00", "12:00");
    expect(intervalsOverlap(report, interval("09:00", "10:00", { userId: "piet" }))).toBe(false);
    expect(intervalsOverlap(report, interval("09:00", "10:00", { workDate: "2026-09-17" }))).toBe(
      false,
    );
  });
});

describe("findOverlaps", () => {
  it("finds the rows that overlap each other, on both of them", () => {
    const rows = [
      interval("08:00", "12:00"),
      interval("12:00", "16:00"),
      interval("11:30", "13:00"),
      interval("17:00", "18:00"),
    ];

    expect(findOverlaps(rows, []).map(({ rows: other }) => other)).toEqual([[2], [2], [0, 1], []]);
  });

  it("finds a repeated row", () => {
    const row = interval("08:00", "16:00");

    expect(findOverlaps([row, { ...row }], [])).toEqual([
      { rows: [1], existing: [] },
      { rows: [0], existing: [] },
    ]);
  });

  it("finds the existing reports a row overlaps", () => {
    const morning = { ...interval("08:00", "12:00"), id: "r1" };
    const evening = { ...interval("16:00", "18:00"), id: "r2" };
    const otherWorker = { ...interval("08:00", "18:00", { userId: "piet" }), id: "r3" };
    const otherDay = { ...interval("08:00", "18:00", { workDate: "2026-09-17" }), id: "r4" };

    const result = findOverlaps(
      [interval("11:00", "17:00"), interval("12:00", "16:00")],
      [morning, evening, otherWorker, otherDay],
    );

    expect(result).toEqual([
      { rows: [1], existing: [morning, evening] },
      { rows: [0], existing: [] },
    ]);
  });

  it("keeps apart the rows of different workers and days", () => {
    const rows = [
      interval("08:00", "16:00"),
      interval("08:00", "16:00", { userId: "piet" }),
      interval("08:00", "16:00", { workDate: "2026-09-19" }),
    ];

    expect(findOverlaps(rows, [])).toEqual([
      { rows: [], existing: [] },
      { rows: [], existing: [] },
      { rows: [], existing: [] },
    ]);
  });
});
