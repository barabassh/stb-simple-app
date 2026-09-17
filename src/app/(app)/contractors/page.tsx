import { getTranslations } from "next-intl/server";

import { requirePagePermission } from "@/lib/auth/current-user";

// The registry itself arrives in step 20.
export default async function ContractorsPage() {
  await requirePagePermission("contractors.read");
  const t = await getTranslations("contractors.list");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold sm:text-2xl">{t("title")}</h1>
    </div>
  );
}
