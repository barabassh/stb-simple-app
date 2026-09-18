import { getTranslations } from "next-intl/server";

import { BackLink } from "@/components/back-link";
import { CustomerForm } from "@/features/customers/components/customer-form";
import { requirePagePermission } from "@/lib/auth/current-user";

export default async function NewCustomerPage() {
  await requirePagePermission("customers.create");
  const t = await getTranslations("customers.form");

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <BackLink href="/customers" label={t("backToList")} />
      <h1 className="text-xl font-semibold sm:text-2xl">{t("createTitle")}</h1>
      <CustomerForm />
    </div>
  );
}
