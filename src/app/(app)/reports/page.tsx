import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { resetFiltersHref } from "@/components/data-table/search-params";
import { Button } from "@/components/ui/button";
import { hideableReportColumns, reportAccess, reportColumns } from "@/features/reports/columns";
import { ReportsTable } from "@/features/reports/components/reports-table";
import { ReportsToolbar } from "@/features/reports/components/reports-toolbar";
import {
  DEFAULT_REPORT_STATUS,
  hasReportFilters,
  parseReportsListParams,
} from "@/features/reports/list-params";
import {
  getReportTableSettings,
  getOwnReportBlock,
  listReportFilterOptions,
  listReports,
} from "@/features/reports/queries";
import { formatHours } from "@/features/reports/time";
import { requirePagePermission } from "@/lib/auth/current-user";
import { formatNumber } from "@/lib/format";
import { can, REPORTS_SECTION } from "@/lib/permissions";

type ReportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Administrators and managers see every report, employees and contractors only their own
// (docs/ТЗ.md, 7.3, 7.9): the query decides, the filters only narrow.
export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const viewer = await requirePagePermission(REPORTS_SECTION);
  const access = reportAccess(viewer);
  const resolvedSearchParams = await searchParams;
  const params = parseReportsListParams(resolvedSearchParams, access);

  const t = await getTranslations();
  const [{ rows, rowCount, totals }, options, block, tableSettings] = await Promise.all([
    listReports(viewer, params),
    listReportFilterOptions(viewer, t("reports.form.ourCompany")),
    can(viewer, "reports.writeOwn") ? getOwnReportBlock(viewer) : null,
    getReportTableSettings(viewer),
  ]);
  const canCreate = can(viewer, "reports.write") || (can(viewer, "reports.writeOwn") && !block);

  const emptyState = hasReportFilters(params) ? (
    <div className="flex flex-col items-center gap-1">
      <span>{t("reports.list.nothingFound")}</span>
      <Button variant="link" asChild>
        <Link href={resetFiltersHref("/reports", resolvedSearchParams)}>
          {t("reports.list.resetFilters")}
        </Link>
      </Button>
    </div>
  ) : (
    t("reports.list.empty")
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold sm:text-2xl">{t("reports.list.title")}</h1>
        {canCreate && (
          <Button asChild>
            <Link href="/reports/new">
              <PlusIcon aria-hidden />
              {t("reports.list.create")}
            </Link>
          </Button>
        )}
      </div>

      {block && (
        <p role="status" className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">
          {t(block)}
        </p>
      )}

      <ReportsToolbar filters={params} defaultStatus={DEFAULT_REPORT_STATUS} options={options} />

      <p className="text-sm text-muted-foreground">
        {t("reports.list.totals", {
          count: formatNumber(totals.count),
          hours: formatHours(totals.minutes),
          km: formatNumber(totals.mileageKm),
        })}
        {access.all && params.status === "all" && (
          <> · {t("reports.list.totalsApproved", { hours: formatHours(totals.approvedMinutes) })}</>
        )}
      </p>

      <ReportsTable
        rows={rows}
        rowCount={rowCount}
        state={params.table}
        columns={reportColumns(access)}
        hideable={hideableReportColumns(access)}
        settings={tableSettings}
        emptyState={emptyState}
        viewer={viewer}
        projectLinks={can(viewer, "projects.read") ? "all" : "inProgress"}
      />
    </div>
  );
}
