import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";
import { listReportProjectOptions } from "@/features/projects/queries";
import { ReportDeleteButton } from "@/features/reports/components/report-delete-button";
import { ReportForm } from "@/features/reports/components/report-form";
import { reportProjectOptions } from "@/features/reports/form-options";
import { getReportForEdit, REPORTS_WRITE } from "@/features/reports/queries";
import { requirePagePermission } from "@/lib/auth/current-user";
import { displayTodayIso, formatCalendarDate, formatShortName } from "@/lib/format";
import { can } from "@/lib/permissions";

type EditReportPageProps = {
  params: Promise<{ id: string }>;
};

/**
 * A worker edits and deletes an unapproved report of their own, an administrator or a manager any
 * report; nobody touches the reports of a closed project (docs/ТЗ.md, 7.7–7.8). The actions refuse
 * the rest anyway: the page only does not offer it.
 */
export default async function EditReportPage({ params }: EditReportPageProps) {
  const viewer = await requirePagePermission(REPORTS_WRITE);
  const { id } = await params;

  const report = await getReportForEdit(viewer, id);
  if (!report) notFound();

  const approved = report.status === "APPROVED";
  const lockedFor = !report.project.inProgress
    ? "closedMessage"
    : approved && !can(viewer, "reports.write")
      ? "approvedMessage"
      : null;

  const [t, projects] = await Promise.all([
    getTranslations(),
    lockedFor ? [] : listReportProjectOptions(viewer),
  ]);
  const date = formatCalendarDate(new Date(`${report.workDate}T00:00:00Z`));

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <BackLink href="/reports" label={t("reports.form.backToList")} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-xl font-semibold sm:text-2xl">{t("reports.form.editTitle")}</h1>
          <p className="break-words text-muted-foreground">
            {t("reports.form.reportName", {
              date,
              worker: formatShortName(report.worker.fullName),
              number: report.project.number,
            })}
          </p>
        </div>
        {!lockedFor && !approved && (
          <ReportDeleteButton
            reportId={report.id}
            date={date}
            projectNumber={report.project.number}
          />
        )}
      </div>

      {lockedFor ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
          <p className="text-muted-foreground">{t(`reports.form.${lockedFor}`)}</p>
          <Button variant="link" asChild>
            <Link href="/reports">{t("reports.form.backToList")}</Link>
          </Button>
        </div>
      ) : (
        <>
          {approved && (
            <p role="status" className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">
              {t("reports.form.approvedHint")}
            </p>
          )}
          <ReportForm
            report={report}
            projects={reportProjectOptions(projects, t)}
            today={displayTodayIso()}
          />
        </>
      )}
    </div>
  );
}
