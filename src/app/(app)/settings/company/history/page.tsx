import { getTranslations } from "next-intl/server";

import { BackLink } from "@/components/back-link";
import { AuditTable } from "@/features/audit/components/audit-table";
import { parseAuditTableState } from "@/features/audit/list-params";
import { listEntityAuditLogs } from "@/features/audit/queries";
import { getCompanyProfileId } from "@/features/company/queries";
import { requirePagePermission } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";

type CompanyHistoryPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CompanyHistoryPage({ searchParams }: CompanyHistoryPageProps) {
  const viewer = await requirePagePermission("settings.company.history");
  const [table, profileId, t] = await Promise.all([
    searchParams.then(parseAuditTableState),
    getCompanyProfileId(viewer),
    getTranslations(),
  ]);
  const history = profileId
    ? await listEntityAuditLogs(viewer, "CompanyProfile", profileId, table)
    : { rows: [], rowCount: 0 };

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/settings" label={t("settings.company.history.back")} />
      <h1 className="text-xl font-semibold sm:text-2xl">{t("settings.company.history.title")}</h1>
      <AuditTable
        rows={history.rows}
        rowCount={history.rowCount}
        state={table}
        emptyState={t("audit.historyEmpty")}
        showEntity={false}
        showRequestInfo={can(viewer, "audit.read")}
      />
    </div>
  );
}
