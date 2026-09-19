import { getTranslations } from "next-intl/server";

import { BackLink } from "@/components/back-link";
import { listReportProjectOptions } from "@/features/projects/queries";
import { ReportForm } from "@/features/reports/components/report-form";
import { reportProjectOptions, reportWorkerOptions } from "@/features/reports/form-options";
import {
  getOwnReportBlock,
  listReportWorkerOptions,
  REPORTS_WRITE,
} from "@/features/reports/queries";
import { requirePagePermission } from "@/lib/auth/current-user";
import { displayTodayIso } from "@/lib/format";
import { can } from "@/lib/permissions";

type NewReportPageProps = {
  searchParams: Promise<{ project?: string | string[] }>;
};

/** Administrators and managers file a report for a worker, the others their own (docs/ТЗ.md, 7.3). */
export default async function NewReportPage({ searchParams }: NewReportPageProps) {
  const viewer = await requirePagePermission(REPORTS_WRITE);
  const forWorker = can(viewer, "reports.write");

  const [t, block, projects, workers, { project }] = await Promise.all([
    getTranslations(),
    forWorker ? null : getOwnReportBlock(viewer),
    listReportProjectOptions(viewer),
    forWorker ? listReportWorkerOptions(viewer) : undefined,
    searchParams,
  ]);
  // A project that is not in progress any more is simply not chosen in advance.
  const projectId = projects.some(({ id }) => id === project) ? (project as string) : undefined;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <BackLink href="/reports" label={t("reports.form.backToList")} />
      <h1 className="text-xl font-semibold sm:text-2xl">{t("reports.form.createTitle")}</h1>
      {block ? (
        <p role="status" className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">
          {t(block)}
        </p>
      ) : (
        <ReportForm
          projects={reportProjectOptions(projects, t)}
          workers={workers && reportWorkerOptions(workers, t)}
          today={displayTodayIso()}
          projectId={projectId}
        />
      )}
    </div>
  );
}
