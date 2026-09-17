import { describe, expect, it } from "vitest";

import { projectDuration } from "@/features/projects/duration";

const date = (iso: string) => new Date(`${iso}T00:00:00Z`);

// 23:30 UTC on 16.09 is already 17.09 in Europe/Kyiv, where the counter is read.
const NOW = new Date("2026-09-16T23:30:00Z");

describe("projectDuration", () => {
  it("counts the first day of a project started today", () => {
    expect(projectDuration({ startDate: date("2026-09-17") }, NOW)).toBe(1);
  });

  it("counts two days for a project started yesterday", () => {
    expect(projectDuration({ startDate: date("2026-09-16") }, NOW)).toBe(2);
  });

  it("reports a project that has not started yet", () => {
    expect(projectDuration({ startDate: date("2026-09-18") }, NOW)).toBeNull();
  });

  it("stops at the closing date of a closed project", () => {
    const closed = { startDate: date("2026-09-01"), closedAt: new Date("2026-09-07T12:00:00Z") };
    expect(projectDuration(closed, NOW)).toBe(7);
    expect(projectDuration(closed, new Date("2026-10-16T23:30:00Z"))).toBe(7);
  });

  it("counts the closing date by the Kyiv day, not the UTC one", () => {
    const closed = { startDate: date("2026-09-01"), closedAt: new Date("2026-09-07T22:30:00Z") };
    expect(projectDuration(closed, NOW)).toBe(8);
  });

  it("crosses a month and a leap day", () => {
    expect(
      projectDuration({ startDate: date("2028-02-27") }, new Date("2028-03-01T09:00:00Z")),
    ).toBe(4);
  });
});
