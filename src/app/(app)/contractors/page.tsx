import { ReferenceRegistry } from "@/components/reference-book/registry";
import { ContractorsTable } from "@/features/contractors/components/contractors-table";
import { contractorsExport } from "@/features/contractors/export";
import {
  hasContractorFilters,
  parseContractorsListParams,
} from "@/features/contractors/list-params";
import { listContractors } from "@/features/contractors/queries";
import { requirePagePermission } from "@/lib/auth/current-user";

type ContractorsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ContractorsPage({ searchParams }: ContractorsPageProps) {
  const viewer = await requirePagePermission("contractors.read");

  const resolvedSearchParams = await searchParams;
  const params = parseContractorsListParams(resolvedSearchParams);
  const { rows, rowCount } = await listContractors(viewer, params);

  return (
    <ReferenceRegistry
      section="contractors"
      viewer={viewer}
      report={contractorsExport}
      searchParams={resolvedSearchParams}
      filters={params}
      hasFilters={hasContractorFilters(params)}
      rowCount={rowCount}
      table={(emptyState) => (
        <ContractorsTable
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
