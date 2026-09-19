import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { BackLink } from "@/components/back-link";
import { readParam, TAB_SEARCH_PARAM } from "@/components/data-table/search-params";
import { DetailsGroup } from "@/components/details/details-group";
import { UrlTabs } from "@/components/url-tabs";
import { AuditTable } from "@/features/audit/components/audit-table";
import { RecordStamps } from "@/features/audit/components/record-stamps";
import { parseAuditTableState } from "@/features/audit/list-params";
import { listEntityAuditLogs } from "@/features/audit/queries";
import { ReportCardActions } from "@/features/reports/components/report-card-actions";
import {
  ReportStatusBadge,
  UnapprovalText,
} from "@/features/reports/components/report-status-badge";
import { reportDetailGroup } from "@/features/reports/details";
import { getReport, type ReportDetails } from "@/features/reports/queries";
import { availableReportActions } from "@/features/reports/report-actions";
import { requirePagePermission } from "@/lib/auth/current-user";
import { formatCalendarDate, formatDateTime, formatShortName } from "@/lib/format";
import { can, REPORTS_SECTION } from "@/lib/permissions";

type ReportPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const DETAILS_TAB = "details";

// The worker opens their own report, an administrator or a manager any; another worker's report is
// not found rather than forbidden (docs/ПРАВА-ДОСТУПА.md, rule 16). The history is for reports.history.
export default async function ReportPage({ params, searchParams }: ReportPageProps) {
  const viewer = await requirePagePermission(REPORTS_SECTION);
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);

  const report = await getReport(viewer, id);
  if (!report) notFound();

  const historyTable = parseAuditTableState(resolvedSearchParams);
  const [history, t] = await Promise.all([
    can(viewer, "reports.history")
      ? listEntityAuditLogs(viewer, "WorkReport", report.id, historyTable)
      : null,
    getTranslations(),
  ]);
  const date = formatCalendarDate(report.workDate);

  const details = (
    <DetailsGroup
      group={reportDetailGroup(report, t, {
        worker: can(viewer, "reports.read") && can(viewer, "users.read"),
        organization: can(viewer, "contractors.read"),
        // A contractor keeps the reports of a closed project, but not its card (rule 21).
        project: can(viewer, "projects.read") || report.project.inProgress,
      })}
    />
  );
  const tabs = history && [
    { value: DETAILS_TAB, label: t("reports.card.tabs.details"), content: details },
    {
      value: "history",
      label: t("reports.card.tabs.history"),
      content: (
        <AuditTable
          rows={history.rows}
          rowCount={history.rowCount}
          state={historyTable}
          emptyState={t("audit.historyEmpty")}
          showEntity={false}
          showRequestInfo={can(viewer, "audit.read")}
        />
      ),
    },
  ];
  const requestedTab = readParam(resolvedSearchParams, TAB_SEARCH_PARAM);
  const tab = tabs?.find(({ value }) => value === requestedTab)?.value ?? DETAILS_TAB;

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/reports" label={t("reports.form.backToList")} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold sm:text-2xl">
            {t("reports.card.title", { date })}
            <ReportStatusBadge status={report.status} />
          </h1>
          <p className="break-words text-muted-foreground">
            {t("reports.card.subtitle", {
              worker: formatShortName(report.worker.fullName),
              number: report.project.number,
              name: report.project.name,
            })}
          </p>
          <RecordStamps
            created={{ at: report.stamps.createdAt, by: report.stamps.createdBy }}
            updated={{ at: report.stamps.updatedAt, by: report.stamps.updatedBy }}
          />
          <ApprovalStamp report={report} t={t} />
        </div>
        <ReportCardActions
          report={{ id: report.id, projectNumber: report.project.number }}
          date={date}
          actions={availableReportActions(viewer, report)}
        />
      </div>

      {tabs ? <UrlTabs value={tab} defaultValue={DETAILS_TAB} tabs={tabs} /> : details}
    </div>
  );
}

/** "Утверждён: дата, автор", or the reason the approval was withdrawn (docs/ТЗ.md, 7.10). */
function ApprovalStamp({
  report,
  t,
}: {
  report: ReportDetails;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  if (report.approval) {
    const { at, by } = report.approval;
    const date = formatDateTime(at);
    return (
      <p className="text-sm text-muted-foreground">
        {by ? (
          <span title={by.login && `${by.fullName} (${by.login})`}>
            {t("reports.card.approvedBy", {
              date,
              author: formatShortName(by.fullName).replaceAll(" ", "\u00A0"),
            })}
          </span>
        ) : (
          t("reports.card.approved", { date })
        )}
      </p>
    );
  }
  if (report.unapproval) {
    return (
      <p role="status" className="rounded-lg border bg-muted/50 px-3 py-2 text-sm break-words">
        <UnapprovalText unapproval={report.unapproval} />
      </p>
    );
  }
  return null;
}
