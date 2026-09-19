import type { ReportForEdit } from "./queries";
import type { OwnReportInput } from "./schemas";
import { formatTime, parseTime } from "./time";

/** The form of either kind of report: `userId` only when filing one for a worker. */
export type ReportFormInput = OwnReportInput & { userId?: string };

/**
 * The values the form opens with. A new report is dated today, with no lunch (docs/ТЗ.md, 7.5);
 * the worker field is there only for an administrator or a manager filing it.
 */
export function reportFormValues(
  report: ReportForEdit | null,
  { today = "", projectId = "", forWorker = false } = {},
): ReportFormInput {
  if (report) {
    return {
      projectId: report.project.id,
      workDate: report.workDate,
      workDescription: report.workDescription,
      startTime: formatTime(report.startMinute),
      endTime: formatTime(report.endMinute),
      lunchMinutes: String(report.lunchMinutes),
      mileageKm: String(report.mileageKm),
    };
  }

  return {
    ...(forWorker ? { userId: "" } : {}),
    projectId,
    workDate: today,
    workDescription: "",
    startTime: "",
    endTime: "",
    lunchMinutes: "0",
    mileageKm: "",
  };
}

/**
 * The minutes worked while the form is typed, or null until the times make sense: shown at once,
 * before the form is sent (docs/ТЗ.md, 7.5). An empty lunch counts as none.
 */
export function workedMinutesOf(input: {
  startTime: string;
  endTime: string;
  lunchMinutes: string;
}): number | null {
  const start = parseTime(input.startTime);
  const end = parseTime(input.endTime);
  const lunchInput = input.lunchMinutes.trim();
  if (start === null || end === null || !/^\d{0,6}$/.test(lunchInput)) return null;

  const worked = end - start - Number(lunchInput);
  return end > start && worked > 0 ? worked : null;
}
