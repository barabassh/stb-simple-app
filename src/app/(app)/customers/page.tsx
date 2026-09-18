import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { resetFiltersHref } from "@/components/data-table/search-params";
import { ExportButtons } from "@/components/export/export-buttons";
import { Button } from "@/components/ui/button";
import { CustomersTable } from "@/features/customers/components/customers-table";
import { CustomersToolbar } from "@/features/customers/components/customers-toolbar";
import { customersExport } from "@/features/customers/export";
import { hasCustomerFilters, parseCustomersListParams } from "@/features/customers/list-params";
import { listCustomers } from "@/features/customers/queries";
import { requirePagePermission } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";

type CustomersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const viewer = await requirePagePermission("customers.read");
  const t = await getTranslations("customers.list");

  const resolvedSearchParams = await searchParams;
  const params = parseCustomersListParams(resolvedSearchParams);
  const { rows, rowCount } = await listCustomers(viewer, params);

  const emptyState = hasCustomerFilters(params) ? (
    <div className="flex flex-col items-center gap-1">
      <span>{t("nothingFound")}</span>
      <Button variant="link" asChild>
        <Link href={resetFiltersHref("/customers", resolvedSearchParams)}>{t("resetFilters")}</Link>
      </Button>
    </div>
  ) : rowCount === 0 ? (
    t("empty")
  ) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold sm:text-2xl">{t("title")}</h1>
        <div className="flex flex-wrap gap-2">
          {can(viewer, customersExport.permission) && (
            <ExportButtons report={customersExport} searchParams={resolvedSearchParams} />
          )}
          {can(viewer, "customers.create") && (
            <Button asChild>
              <Link href="/customers/new">
                <PlusIcon aria-hidden />
                {t("create")}
              </Link>
            </Button>
          )}
        </div>
      </div>

      <CustomersToolbar query={params.query} type={params.type} status={params.status} />
      <CustomersTable
        rows={rows}
        rowCount={rowCount}
        state={params.table}
        emptyState={emptyState}
        viewer={viewer}
      />
    </div>
  );
}
