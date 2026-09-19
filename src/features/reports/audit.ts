import type { AuditValue } from "@/lib/audit";
import { formatCalendarDate, formatShortName } from "@/lib/format";

import { formatTime } from "./time";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** A report as both the stored row and the submitted form can describe it. */
export type ReportAuditRecord = {
  workerName: string;
  /** Null for the company's own employee. */
  organization: string | null;
  project: { number: string; name: string };
  /** `yyyy-MM-dd`. */
  workDate: string;
  workDescription: string;
  startMinute: number;
  endMinute: number;
  lunchMinutes: number;
  mileageKm: number;
};

const calendarDate = (isoDate: string) => formatCalendarDate(new Date(`${isoDate}T00:00:00Z`));

/**
 * The report as the audit log shows it (docs/СХЕМА-БД.md, 10.5): the worker by full name, the
 * project as `2026-001 «Название»`, the organisation by name, the date as dd.MM.yyyy, times as
 * HH:mm, lunch and mileage with their units. The status is not part of it: it changes only through
 * approval, with entries of its own.
 */
export function reportAuditSnapshot(
  report: ReportAuditRecord,
  t: Translate,
): Record<string, AuditValue> {
  return {
    user: report.workerName,
    contractor: report.organization,
    project: t("reports.audit.project", report.project),
    workDate: calendarDate(report.workDate),
    workDescription: report.workDescription,
    startMinute: formatTime(report.startMinute),
    endMinute: formatTime(report.endMinute),
    lunchMinutes: t("reports.audit.minutes", { count: report.lunchMinutes }),
    mileageKm: t("reports.audit.kilometres", { count: report.mileageKm }),
  };
}

/** What a summary names a report by: "Иванов И. И. за 18.09.2026, проект 2026-001". */
export function reportSummaryValues(report: ReportAuditRecord) {
  return {
    worker: formatShortName(report.workerName),
    date: calendarDate(report.workDate),
    number: report.project.number,
  };
}
