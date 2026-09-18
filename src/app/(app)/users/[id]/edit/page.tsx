import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { BackLink } from "@/components/back-link";
import { listContractorOptions } from "@/features/contractors/queries";
import { UserForm } from "@/features/users/components/user-form";
import { getUser } from "@/features/users/queries";
import { FORBIDDEN_PATH } from "@/lib/auth/constants";
import { requirePagePermission } from "@/lib/auth/current-user";
import { can, userUpdatePermission } from "@/lib/permissions";

type EditUserPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditUserPage({ params }: EditUserPageProps) {
  const viewer = await requirePagePermission("users.updateProfile");
  const { id } = await params;

  const user = await getUser(viewer, id);
  if (!user) notFound();
  if (!can(viewer, userUpdatePermission(user))) redirect(FORBIDDEN_PATH);

  const [t, contractors] = await Promise.all([
    getTranslations("users.form"),
    can(viewer, "users.changeContractor")
      ? listContractorOptions(viewer, user.contractor?.id)
      : undefined,
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <BackLink href={`/users/${user.id}`} label={t("backToUser")} />
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold sm:text-2xl">{t("editTitle")}</h1>
        <p className="break-words text-muted-foreground">{user.fullName}</p>
      </div>
      <UserForm user={user} viewer={viewer} contractors={contractors} />
    </div>
  );
}
