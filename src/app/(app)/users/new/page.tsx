import { getTranslations } from "next-intl/server";

import { BackLink } from "@/features/users/components/back-link";
import { UserForm } from "@/features/users/components/user-form";
import { requireUser } from "@/lib/auth/current-user";

export default async function NewUserPage() {
  await requireUser();
  const t = await getTranslations("users.form");

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <BackLink href="/users" label={t("backToList")} />
      <h1 className="text-xl font-semibold sm:text-2xl">{t("createTitle")}</h1>
      <UserForm />
    </div>
  );
}
