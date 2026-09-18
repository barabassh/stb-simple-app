import type { z } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ownReportSchema,
  unapproveReportSchema,
  workerReportSchema,
  type OwnReportInput,
} from "@/features/reports/schemas";

import ru from "../../messages/ru.json";

const PROJECT_ID = "cm3qx8k2p0000abcd1234efgh";
const USER_ID = "cm3qx8k2p0001abcd1234efgh";

const report: OwnReportInput = {
  projectId: PROJECT_ID,
  workDate: "2026-09-18",
  workDescription: "Tegels gelegd in de badkamer",
  startTime: "08:00",
  endTime: "16:30",
  lunchMinutes: "30",
  mileageKm: "42",
};

const messagesFor = (result: z.ZodSafeParseResult<unknown>) =>
  result.success ? [] : result.error.issues.map((issue) => [issue.path.join("."), issue.message]);

const parse = (values: Record<string, unknown>) =>
  ownReportSchema.safeParse({ ...report, ...values });

beforeEach(() => {
  vi.useFakeTimers();
  // 23:30 on 18.09.2026 in Kyiv.
  vi.setSystemTime(new Date("2026-09-18T20:30:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ownReportSchema", () => {
  it("reads the times as minutes from midnight and the numbers as integers", () => {
    const result = parse({ workDescription: "  Tegels gelegd  ", lunchMinutes: "030" });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      projectId: PROJECT_ID,
      workDate: "2026-09-18",
      workDescription: "Tegels gelegd",
      startTime: 480,
      endTime: 990,
      lunchMinutes: 30,
      mileageKm: 42,
    });
  });

  it("rejects a worker field: one's own report is always one's own", () => {
    expect(messagesFor(parse({ userId: USER_ID }))).toEqual([
      ["", "reports.validation.unexpectedField"],
    ]);
  });

  it("rejects an end that is not after the start", () => {
    expect(messagesFor(parse({ startTime: "16:30", endTime: "08:00" }))).toEqual([
      ["endTime", "reports.validation.endNotAfterStart"],
    ]);
    expect(messagesFor(parse({ startTime: "08:00", endTime: "08:00" }))).toEqual([
      ["endTime", "reports.validation.endNotAfterStart"],
    ]);
  });

  it("rejects 24:00: work does not go past midnight", () => {
    expect(messagesFor(parse({ endTime: "24:00" }))).toEqual([
      ["endTime", "reports.validation.timeInvalid"],
    ]);
    expect(parse({ endTime: "23:59" }).success).toBe(true);
  });

  it("rejects a lunch that is not shorter than the time at work", () => {
    expect(
      messagesFor(parse({ startTime: "08:00", endTime: "09:00", lunchMinutes: "60" })),
    ).toEqual([["lunchMinutes", "reports.validation.lunchTooLong"]]);
    expect(parse({ startTime: "08:00", endTime: "09:00", lunchMinutes: "59" }).success).toBe(true);
  });

  it("checks the times only once each of them is valid", () => {
    expect(messagesFor(parse({ startTime: "", endTime: "07:00", lunchMinutes: "x" }))).toEqual([
      ["startTime", "reports.validation.startTimeRequired"],
      ["lunchMinutes", "reports.validation.lunchInvalid"],
    ]);
  });

  it("accepts a mileage from 0 to 2000 km and rejects 2001", () => {
    expect(parse({ mileageKm: "0" }).success).toBe(true);
    expect(parse({ mileageKm: "2000" }).success).toBe(true);
    expect(messagesFor(parse({ mileageKm: "2001" }))).toEqual([
      ["mileageKm", "reports.validation.mileageInvalid"],
    ]);
  });

  it.each(["", "-1", "1,5", "12 km"])("rejects the mileage %j", (mileageKm) => {
    expect(messagesFor(parse({ mileageKm }))).toEqual([
      ["mileageKm", "reports.validation.mileageInvalid"],
    ]);
  });

  it("rejects tomorrow and accepts today and past days, by the date in Kyiv", () => {
    expect(messagesFor(parse({ workDate: "2026-09-19" }))).toEqual([
      ["workDate", "reports.validation.workDateInFuture"],
    ]);
    expect(parse({ workDate: "2026-09-18" }).success).toBe(true);
    expect(parse({ workDate: "2025-01-31" }).success).toBe(true);

    // 00:30 on 19.09 in Kyiv, while it is still 18.09 in UTC.
    vi.setSystemTime(new Date("2026-09-18T21:30:00Z"));
    expect(parse({ workDate: "2026-09-19" }).success).toBe(true);
  });

  it("rejects a missing or malformed date", () => {
    expect(messagesFor(parse({ workDate: "" }))).toEqual([
      ["workDate", "reports.validation.workDateRequired"],
    ]);
    expect(messagesFor(parse({ workDate: "18.09.2026" }))).toEqual([
      ["workDate", "validation.dateInvalid"],
    ]);
    expect(messagesFor(parse({ workDate: "2026-02-30" }))).toEqual([
      ["workDate", "validation.dateInvalid"],
    ]);
  });

  it("requires a project and a description of 3 to 2000 characters", () => {
    expect(messagesFor(parse({ projectId: "", workDescription: " ab " }))).toEqual([
      ["projectId", "reports.validation.projectRequired"],
      ["workDescription", "reports.validation.workDescriptionLength"],
    ]);
    expect(parse({ workDescription: "W".repeat(2000) }).success).toBe(true);
    expect(messagesFor(parse({ workDescription: "W".repeat(2001) }))).toEqual([
      ["workDescription", "reports.validation.workDescriptionLength"],
    ]);
  });
});

describe("workerReportSchema", () => {
  it("requires the worker", () => {
    expect(messagesFor(workerReportSchema.safeParse(report))).toEqual([
      ["userId", "reports.validation.workerRequired"],
    ]);
  });

  it("accepts a report for a worker with the same rules", () => {
    const result = workerReportSchema.safeParse({ ...report, userId: USER_ID });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ userId: USER_ID, startTime: 480, endTime: 990 });

    expect(
      messagesFor(
        workerReportSchema.safeParse({ ...report, userId: USER_ID, workDate: "2026-09-19" }),
      ),
    ).toEqual([["workDate", "reports.validation.workDateInFuture"]]);
  });
});

describe("unapproveReportSchema", () => {
  it("requires a reason of 3 to 500 characters", () => {
    expect(unapproveReportSchema.parse({ reason: "  Verkeerde datum " })).toEqual({
      reason: "Verkeerde datum",
    });
    expect(unapproveReportSchema.safeParse({ reason: "R".repeat(500) }).success).toBe(true);
    for (const reason of [" ab ", "R".repeat(501)]) {
      expect(messagesFor(unapproveReportSchema.safeParse({ reason }))).toEqual([
        ["reason", "reports.validation.reasonLength"],
      ]);
    }
  });
});

it("reports only keys that exist in messages/ru.json", () => {
  const sections: Record<string, Record<string, string>> = {
    "reports.validation.": ru.reports.validation,
    "validation.": ru.validation,
  };
  const reported = [
    ...messagesFor(
      parse({
        projectId: "",
        workDate: "",
        workDescription: "",
        startTime: "",
        endTime: "",
        lunchMinutes: "",
        mileageKm: "",
      }),
    ),
    ...messagesFor(parse({ workDate: "x", startTime: "25:00" })),
    ...messagesFor(parse({ workDate: "2026-09-19", endTime: "07:00" })),
    ...messagesFor(parse({ lunchMinutes: "600" })),
    ...messagesFor(parse({ userId: USER_ID })),
    ...messagesFor(workerReportSchema.safeParse(report)),
    ...messagesFor(unapproveReportSchema.safeParse({ reason: "" })),
  ].map(([, message]) => message);

  expect(new Set(reported).size).toBe(15);
  for (const key of reported) {
    const [prefix, section] = Object.entries(sections).find(([p]) => key.startsWith(p)) ?? [];
    expect(prefix, key).toBeDefined();
    expect(section?.[key.slice(prefix?.length)], key).toBeTypeOf("string");
  }
});
