import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { resetFiltersHref } from "@/components/data-table/search-params";
import { ExportButtons } from "@/components/export/export-buttons";
import { Button } from "@/components/ui/button";
import { listCustomerFilterOptions } from "@/features/customers/queries";
import { projectAccess, projectColumns } from "@/features/projects/columns";
import { ProjectsTable } from "@/features/projects/components/projects-table";
import { ProjectsToolbar } from "@/features/projects/components/projects-toolbar";
import { projectsExport } from "@/features/projects/export";
import { hasProjectFilters, parseProjectsListParams } from "@/features/projects/list-params";
import { listProjects } from "@/features/projects/queries";
import { requirePagePermission } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";

type ProjectsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// A contractor reaches the registry with projects.readActive and sees only projects in progress.
export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const viewer = await requirePagePermission("projects.readActive");
  const access = projectAccess(viewer);

  const resolvedSearchParams = await searchParams;
  const params = parseProjectsListParams(resolvedSearchParams, access);
  const [{ rows, rowCount }, customers, t] = await Promise.all([
    listProjects(viewer, params),
    access.all && can(viewer, "customers.read") ? listCustomerFilterOptions(viewer) : null,
    getTranslations("projects.list"),
  ]);

  const emptyState = hasProjectFilters(params) ? (
    <div className="flex flex-col items-center gap-1">
      <span>{t("nothingFound")}</span>
      <Button variant="link" asChild>
        <Link href={resetFiltersHref("/projects", resolvedSearchParams)}>{t("resetFilters")}</Link>
      </Button>
    </div>
  ) : rowCount === 0 ? (
    t(access.all ? "empty" : "emptyActive")
  ) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold sm:text-2xl">{t("title")}</h1>
        <div className="flex flex-wrap gap-2">
          {can(viewer, projectsExport.permission) && (
            <ExportButtons report={projectsExport} searchParams={resolvedSearchParams} />
          )}
          {can(viewer, "projects.create") && (
            <Button asChild>
              <Link href="/projects/new">
                <PlusIcon aria-hidden />
                {t("create")}
              </Link>
            </Button>
          )}
        </div>
      </div>

      <ProjectsToolbar
        query={params.query}
        status={params.status}
        customerId={params.customerId}
        customers={access.all ? (customers ?? []) : null}
      />
      <ProjectsTable
        rows={rows}
        rowCount={rowCount}
        state={params.table}
        columns={projectColumns(access, "table")}
        emptyState={emptyState}
        viewer={viewer}
      />
    </div>
  );
}
