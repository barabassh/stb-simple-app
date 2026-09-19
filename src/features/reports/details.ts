import { detailText, type DetailGroup, type DetailValue } from "@/components/details/detail-rows";
import { formatCalendarDate, formatNumber } from "@/lib/format";

import type { ReportDetails } from "./queries";
import { formatHours, formatTime } from "./time";

type Translate = (key: string, values?: Record<string, string | number>) => string;

type Links = {
  /** users.read: the worker opens the card of the account. */
  worker: boolean;
  /** contractors.read: the organisation opens the card of the contractor. */
  organization: boolean;
  /** The project's card is open to the reader: every project, or those in progress only. */
  project: boolean;
};

const link = (text: string, href: string, linked: boolean): DetailValue =>
  linked ? { type: "link", text, href, external: false } : detailText(text);

/** The report as its card shows it (docs/ТЗ.md, 7.10), in the "name — value" rows of the profile. */
export function reportDetailGroup(report: ReportDetails, t: Translate, links: Links): DetailGroup {
  const label = (key: string) => t(`reports.fields.${key}`);
  const { worker, organization, project } = report;

  const organizationText = !organization
    ? t("reports.form.ourCompany")
    : organization.isActive
      ? organization.name
      : t("referenceBooks.archivedMark", { name: organization.name });

  return {
    key: "report",
    rows: [
      {
        key: "worker",
        label: label("worker"),
        value: link(t("reports.card.workerValue", worker), `/users/${worker.id}`, links.worker),
      },
      {
        key: "organization",
        label: label("organization"),
        value: organization
          ? link(organizationText, `/contractors/${organization.id}`, links.organization)
          : detailText(organizationText),
      },
      {
        key: "project",
        label: label("project"),
        value: link(
          t("reports.card.projectValue", { number: project.number, name: project.name }),
          `/projects/${project.id}`,
          links.project,
        ),
      },
      {
        key: "workDate",
        label: label("workDate"),
        value: detailText(formatCalendarDate(report.workDate)),
      },
      {
        key: "workDescription",
        label: label("workDescription"),
        value: detailText(report.workDescription),
      },
      {
        key: "startTime",
        label: label("startTime"),
        value: detailText(formatTime(report.startMinute)),
      },
      { key: "endTime", label: label("endTime"), value: detailText(formatTime(report.endMinute)) },
      {
        key: "lunchMinutes",
        label: label("lunchMinutes"),
        value: detailText(formatNumber(report.lunchMinutes)),
      },
      {
        key: "worked",
        label: label("worked"),
        value: detailText(formatHours(report.workedMinutes)),
      },
      {
        key: "mileageKm",
        label: label("mileageKm"),
        value: detailText(formatNumber(report.mileageKm)),
      },
    ],
  };
}
