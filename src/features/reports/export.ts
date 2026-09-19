import { getTranslations } from "next-intl/server";

import { defineExportReport } from "@/lib/export";
import { formatCalendarDate } from "@/lib/format";

import { reportAccess } from "./columns";
import { OUR_COMPANY, parseReportsListParams, type ReportFilters } from "./list-params";
import {
  countReportsForExport,
  listReportsForExport,
  type ReportExportItem,
  type ReportFilterNames,
} from "./queries";
import { formatTime } from "./time";

type ReportExportRow = {
  workDate: Date;
  worker: string;
  nickname: string;
  organization: string;
  projectNumber: string;
  projectName: string;
  workDescription: string;
  start: string;
  end: string;
  lunchMinutes: number;
  hours: number;
  mileageKm: number;
  status: string;
  approvedAt: Date | null;
  approvedBy: string | null;
};

type Translate = Awaited<ReturnType<typeof getTranslations<"reports.export">>>;

const day = (isoDate: string) => formatCalendarDate(new Date(`${isoDate}T00:00:00Z`));

/** The filters in force, for the title: "01.09.2026–30.09.2026, организация «Bouw B.V.»". */
function describeFilters(
  filters: ReportFilters,
  names: ReportFilterNames,
  t: Translate,
  ourCompany: string,
): string[] {
  const parts: string[] = [];
  const { from, to, mileageFrom, mileageTo } = filters;

  if (from && to) parts.push(t("filters.period", { from: day(from), to: day(to) }));
  else if (from) parts.push(t("filters.from", { from: day(from) }));
  else if (to) parts.push(t("filters.to", { to: day(to) }));
  if (names.project) parts.push(t("filters.project", names.project));
  if (filters.organization) {
    const name = filters.organization === OUR_COMPANY ? ourCompany : names.organization;
    if (name) parts.push(t("filters.organization", { name }));
  }
  if (names.worker) parts.push(t("filters.worker", { nickname: names.worker }));
  if (filters.status !== "all") parts.push(t(`filters.status.${filters.status}`));
  if (filters.mileage === "none" || filters.mileage === "some") {
    parts.push(t(`filters.mileage.${filters.mileage}`));
  }
  if (filters.mileage === "range") {
    if (mileageFrom != null && mileageTo != null) {
      parts.push(t("filters.mileage.range", { from: mileageFrom, to: mileageTo }));
    } else if (mileageFrom != null) {
      parts.push(t("filters.mileage.from", { from: mileageFrom }));
    } else if (mileageTo != null) {
      parts.push(t("filters.mileage.to", { to: mileageTo }));
    }
  }
  if (filters.query) parts.push(t("filters.query", { query: filters.query }));
  return parts;
}

/**
 * The timesheet (docs/ТЗ.md, 7.12): one row per report of the registry with its filters, from
 * /reports or from the "Отчёты" tab of a project with the project as a filter. Hours and
 * kilometres are summed by the query, as the registry's totals are.
 */
export const reportsExport = defineExportReport<ReportExportRow>({
  name: "reports",
  path: "/reports",
  permission: "reports.export",
  entity: "WorkReport",
  count: (actor, searchParams) =>
    countReportsForExport(actor, parseReportsListParams(searchParams, reportAccess(actor))),
  async columns() {
    const t = await getTranslations("reports.export");
    return [
      { key: "workDate", header: t("columns.workDate"), format: "date" },
      { key: "worker", header: t("columns.worker") },
      { key: "nickname", header: t("columns.nickname") },
      { key: "organization", header: t("columns.organization") },
      { key: "projectNumber", header: t("columns.projectNumber") },
      { key: "projectName", header: t("columns.projectName") },
      { key: "workDescription", header: t("columns.workDescription"), width: 40 },
      { key: "start", header: t("columns.start") },
      { key: "end", header: t("columns.end") },
      { key: "lunchMinutes", header: t("columns.lunchMinutes"), format: "number" },
      { key: "hours", header: t("columns.hours"), format: "decimal" },
      { key: "mileageKm", header: t("columns.mileageKm"), format: "number" },
      { key: "status", header: t("columns.status") },
      { key: "approvedAt", header: t("columns.approvedAt"), format: "datetime" },
      { key: "approvedBy", header: t("columns.approvedBy") },
    ];
  },
  async load(actor, searchParams) {
    const params = parseReportsListParams(searchParams, reportAccess(actor));
    const [t, tReports, { rows, totals, filterNames }] = await Promise.all([
      getTranslations("reports.export"),
      getTranslations("reports"),
      listReportsForExport(actor, params),
    ]);
    const ourCompany = tReports("form.ourCompany");

    const row = (report: ReportExportItem): ReportExportRow => ({
      workDate: report.workDate,
      worker: report.worker.fullName,
      nickname: report.worker.nickname,
      organization: report.organization ?? ourCompany,
      projectNumber: report.project.number,
      projectName: report.project.name,
      workDescription: report.workDescription,
      start: formatTime(report.startMinute),
      end: formatTime(report.endMinute),
      lunchMinutes: report.lunchMinutes,
      hours: report.workedMinutes / 60,
      mileageKm: report.mileageKm,
      status: tReports(`statuses.${report.status}`),
      approvedAt: report.approval?.at ?? null,
      approvedBy: report.approval?.by ?? null,
    });

    const filters = describeFilters(params, filterNames, t, ourCompany);

    return {
      title: filters.length > 0 ? `${t("title")} — ${filters.join(", ")}` : t("title"),
      rows: rows.map(row),
      // Hours come from the sum of minutes, as on screen, not from the sum of rounded rows.
      totals: { hours: totals.minutes / 60, mileageKm: totals.mileageKm },
    };
  },
});
