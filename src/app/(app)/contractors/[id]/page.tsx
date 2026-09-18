import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ReferenceCard } from "@/components/reference-book/card";
import { changeContractorStatus } from "@/features/contractors/actions";
import { ContractorAccounts } from "@/features/contractors/components/contractor-accounts";
import { ContractorDetails } from "@/features/contractors/components/contractor-details";
import { getContractor } from "@/features/contractors/queries";
import { listContractorUsers } from "@/features/users/queries";
import { requirePagePermission } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";

type ContractorPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ContractorPage({ params, searchParams }: ContractorPageProps) {
  const viewer = await requirePagePermission("contractors.read");
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);

  const contractor = await getContractor(viewer, id);
  if (!contractor) notFound();

  // An employee sees the contractor but not the list of its accounts (docs/ПРАВА-ДОСТУПА.md, 15).
  const [accounts, t] = await Promise.all([
    can(viewer, "users.read") ? listContractorUsers(viewer, id) : null,
    getTranslations(),
  ]);

  return (
    <ReferenceCard
      section="contractors"
      entity="Contractor"
      viewer={viewer}
      record={contractor}
      subtitle={
        contractor.legalForm ? t(`settings.company.legalForms.${contractor.legalForm}`) : undefined
      }
      changeStatus={changeContractorStatus}
      searchParams={resolvedSearchParams}
      details={<ContractorDetails contractor={contractor} />}
      tabs={
        accounts
          ? [
              {
                value: "accounts",
                label: t("contractors.card.tabs.accounts"),
                content: <ContractorAccounts users={accounts} />,
              },
            ]
          : []
      }
    />
  );
}
