import type { RecordOption } from "@/components/reference-book/record-picker";
import type { ReportProjectOption } from "@/features/projects/queries";

import type { ReportWorkerOption } from "./queries";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * The choices of the report form, labelled so that the search line finds a project by number, name
 * and city, and a worker by full name and nickname (docs/ТЗ.md, 7.5).
 */
export function reportProjectOptions(
  projects: ReportProjectOption[],
  t: Translate,
): RecordOption[] {
  return projects.map(({ id, ...project }) => ({
    id,
    name: t("reports.form.projectOption", project),
    isActive: true,
  }));
}

export function reportWorkerOptions(workers: ReportWorkerOption[], t: Translate): RecordOption[] {
  return workers.map(({ id, fullName, nickname, organization }) => ({
    id,
    name: t("reports.form.workerOption", {
      fullName,
      nickname,
      organization: organization ?? t("reports.form.ourCompany"),
    }),
    isActive: true,
  }));
}
