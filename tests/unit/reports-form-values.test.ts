import { describe, expect, it } from "vitest";

import { reportFormValues, workedMinutesOf } from "@/features/reports/form-values";
import { ownReportSchema } from "@/features/reports/schemas";
import { formatHours } from "@/features/reports/time";

const worked = (startTime: string, endTime: string, lunchMinutes = "0") =>
  workedMinutesOf({ startTime, endTime, lunchMinutes });

describe("the hours the report form shows while typing", () => {
  it("counts the end minus the start minus lunch", () => {
    expect(formatHours(worked("08:00", "16:30", "30") ?? -1)).toBe("8,00");
    expect(formatHours(worked("08:00", "15:05") ?? -1)).toBe("7,08");
  });

  it("takes an empty lunch as none", () => {
    expect(worked("08:00", "12:00", "")).toBe(240);
  });

  it("shows nothing until the times make sense", () => {
    expect(worked("", "12:00")).toBeNull();
    expect(worked("12:00", "08:00")).toBeNull();
    expect(worked("08:00", "12:00", "240")).toBeNull();
    expect(worked("08:00", "12:00", "tien")).toBeNull();
  });
});

describe("the values a new report opens with", () => {
  it("are today's date, no lunch and no worker field for one's own report", () => {
    const values = reportFormValues(null, { today: "2026-09-19", projectId: "p" });
    expect(values).toMatchObject({ workDate: "2026-09-19", projectId: "p", lunchMinutes: "0" });
    expect(values).not.toHaveProperty("userId");
    // The strict schema of one's own report must not meet a key it refuses.
    expect(
      ownReportSchema.safeParse(values).error?.issues.map(({ path }) => path[0]),
    ).not.toContain(undefined);
  });

  it("have an empty worker for a report filed for someone", () => {
    expect(reportFormValues(null, { forWorker: true })).toHaveProperty("userId", "");
  });
});
