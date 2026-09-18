import { getTranslations } from "next-intl/server";

import { BackLink } from "@/components/back-link";
import { ContractorForm } from "@/features/contractors/components/contractor-form";
import { requirePagePermission } from "@/lib/auth/current-user";

export default async function NewContractorPage() {
  await requirePagePermission("contractors.create");
  const t = await getTranslations("contractors.form");

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <BackLink href="/contractors" label={t("backToList")} />
      <h1 className="text-xl font-semibold sm:text-2xl">{t("createTitle")}</h1>
      <ContractorForm />
    </div>
  );
}
