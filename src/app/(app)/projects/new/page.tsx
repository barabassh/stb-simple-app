import { getTranslations } from "next-intl/server";

import { BackLink } from "@/components/back-link";
import { listCustomerOptions } from "@/features/customers/queries";
import { ProjectForm } from "@/features/projects/components/project-form";
import { suggestProjectNumber } from "@/features/projects/queries";
import { requirePagePermission } from "@/lib/auth/current-user";

export default async function NewProjectPage() {
  const viewer = await requirePagePermission("projects.create");
  const [suggestedNumber, customers, t] = await Promise.all([
    suggestProjectNumber(viewer),
    listCustomerOptions(viewer),
    getTranslations("projects.form"),
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <BackLink href="/projects" label={t("backToList")} />
      <h1 className="text-xl font-semibold sm:text-2xl">{t("createTitle")}</h1>
      <ProjectForm suggestedNumber={suggestedNumber} customers={customers} />
    </div>
  );
}
