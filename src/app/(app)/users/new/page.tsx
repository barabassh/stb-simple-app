import { getTranslations } from "next-intl/server";

import { BackLink } from "@/components/back-link";
import { listContractorOptions } from "@/features/contractors/queries";
import { UserForm } from "@/features/users/components/user-form";
import { requirePagePermission } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";

export default async function NewUserPage() {
  const viewer = await requirePagePermission("users.create");
  const [t, contractors] = await Promise.all([
    getTranslations("users.form"),
    can(viewer, "users.changeContractor") ? listContractorOptions(viewer) : undefined,
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <BackLink href="/users" label={t("backToList")} />
      <h1 className="text-xl font-semibold sm:text-2xl">{t("createTitle")}</h1>
      <UserForm viewer={viewer} contractors={contractors} />
    </div>
  );
}
