import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { resetFiltersHref } from "@/components/data-table/search-params";
import { ExportButtons } from "@/components/export/export-buttons";
import { Button } from "@/components/ui/button";
import { AuditTable } from "@/features/audit/components/audit-table";
import { AuditToolbar } from "@/features/audit/components/audit-toolbar";
import { auditExport } from "@/features/audit/export";
import { hasAuditFilters, parseAuditListParams } from "@/features/audit/list-params";
import { listAuditLogs } from "@/features/audit/queries";
import { requirePagePermission } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";

type AuditPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const viewer = await requirePagePermission("audit.read");
  const t = await getTranslations("audit");

  const resolvedSearchParams = await searchParams;
  const params = parseAuditListParams(resolvedSearchParams);
  const { rows, rowCount } = await listAuditLogs(viewer, params);

  const emptyState = hasAuditFilters(params) ? (
    <div className="flex flex-col items-center gap-1">
      <span>{t("nothingFound")}</span>
      <Button variant="link" asChild>
        <Link href={resetFiltersHref("/audit", resolvedSearchParams)}>{t("filters.reset")}</Link>
      </Button>
    </div>
  ) : rowCount === 0 ? (
    t("empty")
  ) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold sm:text-2xl">{t("title")}</h1>
        {can(viewer, auditExport.permission) && (
          <ExportButtons report={auditExport} searchParams={resolvedSearchParams} />
        )}
      </div>
      <AuditToolbar
        actor={params.actor}
        actions={params.actions}
        entity={params.entity}
        from={params.from}
        to={params.to}
      />
      <AuditTable rows={rows} rowCount={rowCount} state={params.table} emptyState={emptyState} />
    </div>
  );
}
