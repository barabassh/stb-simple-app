import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { BackLink } from "@/components/back-link";
import { readParam, TAB_SEARCH_PARAM } from "@/components/data-table/search-params";
import { UrlTabs } from "@/components/url-tabs";
import { AuditTable } from "@/features/audit/components/audit-table";
import { RecordStamps } from "@/features/audit/components/record-stamps";
import { parseAuditTableState } from "@/features/audit/list-params";
import { listEntityAuditLogs } from "@/features/audit/queries";
import { CustomerCardActions } from "@/features/customers/components/customer-card-actions";
import { CustomerDetails } from "@/features/customers/components/customer-details";
import { CustomerStatusBadge } from "@/features/customers/components/customer-status-badge";
import { getCustomer } from "@/features/customers/queries";
import { requirePagePermission } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";

type CustomerPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const DETAILS_TAB = "details";

export default async function CustomerPage({ params, searchParams }: CustomerPageProps) {
  const viewer = await requirePagePermission("customers.read");
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);

  const customer = await getCustomer(viewer, id);
  if (!customer) notFound();

  const historyTable = parseAuditTableState(resolvedSearchParams);
  const [history, t] = await Promise.all([
    can(viewer, "customers.history")
      ? listEntityAuditLogs(viewer, "Customer", id, historyTable)
      : null,
    getTranslations(),
  ]);

  const tabs = [
    {
      value: DETAILS_TAB,
      label: t("customers.card.tabs.details"),
      content: <CustomerDetails customer={customer} />,
    },
    {
      value: "projects",
      label: t("customers.card.tabs.projects"),
      // The list of projects arrives with the registry of projects (step 21).
      content: (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {t("customers.card.projectsEmpty")}
        </p>
      ),
    },
    ...(history
      ? [
          {
            value: "history",
            label: t("customers.card.tabs.history"),
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

  const requestedTab = readParam(resolvedSearchParams, TAB_SEARCH_PARAM);
  const tab = tabs.find(({ value }) => value === requestedTab)?.value ?? DETAILS_TAB;

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/customers" label={t("customers.form.backToList")} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold break-words sm:text-2xl">
            {customer.name}
            <CustomerStatusBadge isActive={customer.isActive} />
          </h1>
          <p className="text-muted-foreground">{t(`customers.types.${customer.type}`)}</p>
          <RecordStamps
            created={{ at: customer.createdAt, by: customer.createdBy }}
            updated={{ at: customer.updatedAt, by: customer.updatedBy }}
          />
        </div>
        <CustomerCardActions
          customer={{ id: customer.id, name: customer.name, isActive: customer.isActive }}
          viewer={viewer}
        />
      </div>

      <UrlTabs value={tab} defaultValue={DETAILS_TAB} tabs={tabs} />
    </div>
  );
}
