import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/lib/auth/session";

import { hideableReportColumns, reportColumns, type ReportAccess } from "../columns";
import { DEFAULT_REPORT_STATUS, type ReportsListParams } from "../list-params";
import type {
  ReportTableSettings,
  OwnReportBlock,
  ProjectReportTotals as Totals,
  ReportFilterOptions,
  ReportListItem,
} from "../queries";
import { ProjectReportTotals } from "./project-report-totals";
import { ReportsTable } from "./reports-table";
import { ReportsToolbar } from "./reports-toolbar";

type ProjectReportsProps = {
  projectId: string;
  viewer: Pick<SessionUser, "role">;
  access: ReportAccess;
  params: ReportsListParams;
  options: ReportFilterOptions;
  rows: ReportListItem[];
  rowCount: number;
  totals: Totals;
  /** The user's column settings, shared with the registry. */
  tableSettings: ReportTableSettings;
  /** Whether the "Новый отчёт" button is offered: the project is in progress and nothing blocks it. */
  canCreate: boolean;
  /** Why the reader may not file a report of their own, shown instead of the button. */
  block: OwnReportBlock | null;
  /** Null when no filter is set; otherwise the link that resets them. */
  resetFiltersHref: string | null;
};

/**
 * The "Отчёты" tab of a project card (docs/ТЗ.md, 7.11): the registry's table without the project,
 * which the page fixes, and the totals of the whole project over it.
 */
export function ProjectReports({
  projectId,
  viewer,
  access,
  params,
  options,
  rows,
  rowCount,
  totals,
  tableSettings,
  canCreate,
  block,
  resetFiltersHref,
}: ProjectReportsProps) {
  const t = useTranslations("reports");
  const tAll = useTranslations();

  const emptyState = resetFiltersHref ? (
    <div className="flex flex-col items-center gap-1">
      <span>{t("list.nothingFound")}</span>
      <Button variant="link" asChild>
        <Link href={resetFiltersHref}>{t("list.resetFilters")}</Link>
      </Button>
    </div>
  ) : (
    t(access.all ? "project.empty" : "project.emptyOwn")
  );

  return (
    <div className="flex flex-col gap-4">
      <ProjectReportTotals totals={totals} own={!access.all} />

      {canCreate && (
        <div>
          <Button asChild>
            <Link href={`/reports/new?${new URLSearchParams({ project: projectId })}`}>
              <PlusIcon aria-hidden />
              {t("list.create")}
            </Link>
          </Button>
        </div>
      )}
      {block && (
        <p role="status" className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">
          {tAll(block)}
        </p>
      )}

      <ReportsToolbar filters={params} defaultStatus={DEFAULT_REPORT_STATUS} options={options} />

      <ReportsTable
        rows={rows}
        rowCount={rowCount}
        state={params.table}
        columns={reportColumns(access, "project")}
        hideable={hideableReportColumns(access, "project")}
        settings={tableSettings}
        emptyState={emptyState}
        viewer={viewer}
        projectLinks="all"
      />
    </div>
  );
}
