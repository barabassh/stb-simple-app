import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { BackLink } from "@/components/back-link";
import {
  readParam,
  resetFiltersHref,
  TAB_SEARCH_PARAM,
} from "@/components/data-table/search-params";
import { DetailsGroup } from "@/components/details/details-group";
import { UrlTabs } from "@/components/url-tabs";
import { AuditTable } from "@/features/audit/components/audit-table";
import { RecordStamps } from "@/features/audit/components/record-stamps";
import { parseAuditTableState } from "@/features/audit/list-params";
import { listEntityAuditLogs } from "@/features/audit/queries";
import { ProjectCardActions } from "@/features/projects/components/project-card-actions";
import { ProjectClosedStamp } from "@/features/projects/components/project-closed-stamp";
import { ProjectStatusBadge } from "@/features/projects/components/project-status-badge";
import { projectDetailGroup } from "@/features/projects/details";
import { getProject } from "@/features/projects/queries";
import { reportAccess } from "@/features/reports/columns";
import { ProjectParticipants } from "@/features/reports/components/project-participants";
import { ProjectReports } from "@/features/reports/components/project-reports";
import {
  hasReportFilters,
  parseReportsListParams,
  REPORTS_SEARCH_PARAMS,
} from "@/features/reports/list-params";
import {
  getReportTableSettings,
  getOwnReportBlock,
  getProjectReportTotals,
  listProjectParticipants,
  listReportFilterOptions,
  listReports,
} from "@/features/reports/queries";
import { FORBIDDEN_PATH } from "@/lib/auth/constants";
import { requirePagePermission } from "@/lib/auth/current-user";
import { can, canAny, REPORTS_SECTION } from "@/lib/permissions";

type ProjectPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const DETAILS_TAB = "details";
const REPORTS_TAB = "reports";
const PARTICIPANTS_TAB = "participants";
const HISTORY_TAB = "history";

/** The tab's filters without the tab, and the project the page fixes, as the registry reads them. */
function projectExportSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
  projectId: string,
): Record<string, string | string[] | undefined> {
  const filters = Object.entries(searchParams).filter(([key]) => key !== TAB_SEARCH_PARAM);
  return { ...Object.fromEntries(filters), [REPORTS_SEARCH_PARAMS.project]: projectId };
}

// A contractor opens the card of a project in progress with projects.readActive: the details and
// their own reports, without stamps or buttons (docs/ТЗ.md, 6.9, 7.11).
export default async function ProjectPage({ params, searchParams }: ProjectPageProps) {
  const viewer = await requirePagePermission("projects.readActive");
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const requestedTab = readParam(resolvedSearchParams, TAB_SEARCH_PARAM);

  // The participants are not merely hidden: their tab's address is refused (docs/ПРАВА-ДОСТУПА.md, 20).
  const showParticipants = can(viewer, "projects.participants");
  if (requestedTab === PARTICIPANTS_TAB && !showParticipants) redirect(FORBIDDEN_PATH);

  const project = await getProject(viewer, id);
  if (!project) notFound();

  const showReports = canAny(viewer, REPORTS_SECTION);
  const showHistory = can(viewer, "projects.history");
  // The reports and the history tables share the paging and sorting parameters, so each reads them
  // only while its tab is open; switching tabs drops them (UrlTabs).
  const tabParams = (tab: string) => (requestedTab === tab ? resolvedSearchParams : {});
  const historyTable = parseAuditTableState(tabParams(HISTORY_TAB));
  const access = reportAccess(viewer);
  const reportParams = parseReportsListParams(tabParams(REPORTS_TAB), access, "project");
  // A reader without projects.read gets only projects in progress, without the status.
  const inProgress = (project.status ?? "IN_PROGRESS") === "IN_PROGRESS";

  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const [history, reports, totals, options, block, participants, tableSettings] = await Promise.all(
    [
      showHistory ? listEntityAuditLogs(viewer, "Project", project.id, historyTable) : null,
      showReports ? listReports(viewer, { ...reportParams, projectId: project.id }) : null,
      showReports ? getProjectReportTotals(viewer, project.id) : null,
      showReports
        ? listReportFilterOptions(viewer, t("reports.form.ourCompany"), project.id)
        : null,
      can(viewer, "reports.writeOwn") ? getOwnReportBlock(viewer) : null,
      showParticipants ? listProjectParticipants(viewer, project.id) : null,
      showReports ? getReportTableSettings(viewer) : null,
    ],
  );

  const details = (
    <DetailsGroup
      group={projectDetailGroup(project, t, locale, {
        customerLink: can(viewer, "customers.read"),
      })}
    />
  );
  const tabs = [
    { value: DETAILS_TAB, label: t("projects.card.tabs.details"), content: details },
    ...(reports && totals && options && tableSettings
      ? [
          {
            value: REPORTS_TAB,
            label: t("projects.card.tabs.reports"),
            content: (
              <ProjectReports
                projectId={project.id}
                viewer={viewer}
                access={access}
                params={reportParams}
                options={options}
                rows={reports.rows}
                rowCount={reports.rowCount}
                totals={totals}
                tableSettings={tableSettings}
                canCreate={
                  inProgress &&
                  (can(viewer, "reports.write") || (can(viewer, "reports.writeOwn") && !block))
                }
                block={inProgress ? block : null}
                exportSearchParams={
                  can(viewer, "reports.export")
                    ? projectExportSearchParams(tabParams(REPORTS_TAB), project.id)
                    : null
                }
                resetFiltersHref={
                  hasReportFilters(reportParams)
                    ? resetFiltersHref(`/projects/${project.id}`, resolvedSearchParams, [
                        TAB_SEARCH_PARAM,
                      ])
                    : null
                }
              />
            ),
          },
        ]
      : []),
    ...(participants
      ? [
          {
            value: PARTICIPANTS_TAB,
            label: t("projects.card.tabs.participants"),
            content: (
              <ProjectParticipants groups={participants} userLinks={can(viewer, "users.read")} />
            ),
          },
        ]
      : []),
    ...(history
      ? [
          {
            value: HISTORY_TAB,
            label: t("projects.card.tabs.history"),
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
        ]
      : []),
  ];
  const tab = tabs.find(({ value }) => value === requestedTab)?.value ?? DETAILS_TAB;

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/projects" label={t("projects.form.backToList")} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold sm:text-2xl">
            {t("projects.card.title", { number: project.number })}
            {project.status && <ProjectStatusBadge status={project.status} />}
          </h1>
          <p className="break-words text-muted-foreground">{project.name}</p>
          {project.stamps && (
            <>
              <RecordStamps
                created={{ at: project.stamps.createdAt, by: project.stamps.createdBy }}
                updated={{ at: project.stamps.updatedAt, by: project.stamps.updatedBy }}
              />
              {project.stamps.closed && <ProjectClosedStamp {...project.stamps.closed} />}
            </>
          )}
        </div>
        {project.status && (
          <ProjectCardActions
            project={{ id: project.id, number: project.number, status: project.status }}
            viewer={viewer}
          />
        )}
      </div>

      {tabs.length > 1 ? <UrlTabs value={tab} defaultValue={DETAILS_TAB} tabs={tabs} /> : details}
    </div>
  );
}
