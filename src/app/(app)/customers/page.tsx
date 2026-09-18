import { getTranslations } from "next-intl/server";

import { ReferenceRegistry } from "@/components/reference-book/registry";
import { CustomersTable } from "@/features/customers/components/customers-table";
import { customersExport } from "@/features/customers/export";
import {
  CUSTOMER_TYPE_SEARCH_PARAM,
  CUSTOMER_TYPES,
  hasCustomerFilters,
  parseCustomersListParams,
} from "@/features/customers/list-params";
import { listCustomers } from "@/features/customers/queries";
import { requirePagePermission } from "@/lib/auth/current-user";

type CustomersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const viewer = await requirePagePermission("customers.read");
  const t = await getTranslations("customers");

  const resolvedSearchParams = await searchParams;
  const params = parseCustomersListParams(resolvedSearchParams);
  const { rows, rowCount } = await listCustomers(viewer, params);

  return (
    <ReferenceRegistry
      section="customers"
      viewer={viewer}
      report={customersExport}
      searchParams={resolvedSearchParams}
      filters={params}
      selectFilters={[
        {
          param: CUSTOMER_TYPE_SEARCH_PARAM,
          value: params.type,
          label: t("list.typeFilter"),
          allLabel: t("list.typeFilters.all"),
          options: CUSTOMER_TYPES.map((type) => ({ value: type, label: t(`types.${type}`) })),
        },
      ]}
      hasFilters={hasCustomerFilters(params)}
      rowCount={rowCount}
      table={(emptyState) => (
        <CustomersTable
          rows={rows}
          rowCount={rowCount}
          state={params.table}
          emptyState={emptyState}
          viewer={viewer}
        />
      )}
    />
  );
}
