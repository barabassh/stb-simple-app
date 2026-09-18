import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { BackLink } from "@/components/back-link";
import { readParam, TAB_SEARCH_PARAM } from "@/components/data-table/search-params";
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
import { requirePagePermission } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";

type ProjectPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const DETAILS_TAB = "details";

// A contractor opens the card of a project in progress with projects.readActive: the details only,
// without tabs, stamps or buttons (docs/ТЗ.md, 6.9).
export default async function ProjectPage({ params, searchParams }: ProjectPageProps) {
  const viewer = await requirePagePermission("projects.readActive");
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);

  const project = await getProject(viewer, id);
  if (!project) notFound();

  const historyTable = parseAuditTableState(resolvedSearchParams);
  const [history, t, locale] = await Promise.all([
    can(viewer, "projects.history")
      ? listEntityAuditLogs(viewer, "Project", project.id, historyTable)
      : null,
    getTranslations(),
    getLocale(),
  ]);

  const details = (
    <DetailsGroup
      group={projectDetailGroup(project, t, locale, {
        customerLink: can(viewer, "customers.read"),
      })}
    />
  );
  const tabs = history && [
    { value: DETAILS_TAB, label: t("projects.card.tabs.details"), content: details },
    {
      value: "history",
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
  ];
  const requestedTab = readParam(resolvedSearchParams, TAB_SEARCH_PARAM);
  const tab = tabs?.find(({ value }) => value === requestedTab)?.value ?? DETAILS_TAB;

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

      {tabs ? <UrlTabs value={tab} defaultValue={DETAILS_TAB} tabs={tabs} /> : details}
    </div>
  );
}
