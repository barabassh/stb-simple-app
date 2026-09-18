import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { BackLink } from "@/components/back-link";
import { ContractorForm } from "@/features/contractors/components/contractor-form";
import { getContractor } from "@/features/contractors/queries";
import { requirePagePermission } from "@/lib/auth/current-user";

type EditContractorPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditContractorPage({ params }: EditContractorPageProps) {
  const viewer = await requirePagePermission("contractors.update");
  const { id } = await params;

  const contractor = await getContractor(viewer, id);
  if (!contractor) notFound();

  const t = await getTranslations("contractors.form");

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <BackLink href={`/contractors/${contractor.id}`} label={t("backToContractor")} />
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold sm:text-2xl">{t("editTitle")}</h1>
        <p className="break-words text-muted-foreground">{contractor.name}</p>
      </div>
      <ContractorForm contractor={contractor} />
    </div>
  );
}
