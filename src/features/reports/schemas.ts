import { z } from "zod";

import { displayTodayIso } from "@/lib/format";
import { isoDateFormat, validationMessage } from "@/lib/nl/schemas";

import { parseTime } from "./time";

// The work report form (docs/ТЗ.md, 7.5–7.6), parsed by the form and again by the action. Times
// come in as "HH:mm" and leave as minutes from midnight. That the date is not before the
// project's start date is checked by the action: the form does not know the project's dates.

const message = (key: string) => `reports.validation.${key}`;

export const MAX_MILEAGE_KM = 2000;

const timeField = (requiredKey: string) =>
  z
    .string()
    .trim()
    .min(1, message(requiredKey))
    .refine((value) => value === "" || parseTime(value) !== null, message("timeInvalid"))
    .transform((value) => parseTime(value) ?? 0);

const wholeNumberField = (key: string, max?: number) =>
  z
    .string()
    .trim()
    .refine(
      (value) => /^\d{1,6}$/.test(value) && (max === undefined || Number(value) <= max),
      message(key),
    )
    .transform(Number);

const reportShape = {
  projectId: z.cuid(message("projectRequired")),
  workDate: z
    .string()
    .trim()
    .min(1, message("workDateRequired"))
    .superRefine((value, ctx) => {
      if (value === "") return;
      if (!isoDateFormat.safeParse(value).success) {
        ctx.addIssue({ code: "custom", message: validationMessage("dateInvalid") });
      } else if (value > displayTodayIso()) {
        ctx.addIssue({ code: "custom", message: message("workDateInFuture") });
      }
    }),
  workDescription: z
    .string()
    .trim()
    .min(3, message("workDescriptionLength"))
    .max(2000, message("workDescriptionLength")),
  startTime: timeField("startTimeRequired"),
  endTime: timeField("endTimeRequired"),
  lunchMinutes: wholeNumberField("lunchInvalid"),
  mileageKm: wholeNumberField("mileageInvalid", MAX_MILEAGE_KM),
};

type ReportTime = { startTime: number; endTime: number; lunchMinutes: number };

function checkTime({ startTime, endTime, lunchMinutes }: ReportTime, ctx: z.RefinementCtx) {
  if (endTime <= startTime) {
    ctx.addIssue({ code: "custom", message: message("endNotAfterStart"), path: ["endTime"] });
  } else if (lunchMinutes >= endTime - startTime) {
    ctx.addIssue({ code: "custom", message: message("lunchTooLong"), path: ["lunchMinutes"] });
  }
}

const timeFields: ReadonlySet<PropertyKey> = new Set(["startTime", "endTime", "lunchMinutes"]);

const checkTimeOptions = {
  // Zod skips object refinements after a type error anywhere in the form; the times depend only
  // on these three fields.
  when: ({ issues }: { issues: readonly { path?: readonly PropertyKey[] }[] }) =>
    !issues.some(({ path }) => path?.[0] !== undefined && timeFields.has(path[0])),
};

/**
 * A report of one's own: the worker is the user who sends it, so the form has no worker field and
 * a submitted `userId` is rejected rather than ignored.
 */
export const ownReportSchema = z
  .strictObject(reportShape, {
    error: (issue) => (issue.code === "unrecognized_keys" ? message("unexpectedField") : undefined),
  })
  .superRefine(checkTime, checkTimeOptions);

/** A report an administrator or a manager makes for a worker (docs/ТЗ.md, 7.2). */
export const workerReportSchema = z
  .object({ userId: z.cuid(message("workerRequired")), ...reportShape })
  .superRefine(checkTime, checkTimeOptions);

/** The reason an approval is withdrawn for, shown to the worker (docs/ТЗ.md, 7.7). */
export const unapproveReportSchema = z.object({
  reason: z.string().trim().min(3, message("reasonLength")).max(500, message("reasonLength")),
});

export type OwnReportInput = z.input<typeof ownReportSchema>;
export type OwnReportValues = z.output<typeof ownReportSchema>;
export type WorkerReportInput = z.input<typeof workerReportSchema>;
export type WorkerReportValues = z.output<typeof workerReportSchema>;
export type UnapproveReportInput = z.input<typeof unapproveReportSchema>;
