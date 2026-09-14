import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { BackLink } from "@/features/users/components/back-link";
import { UserForm } from "@/features/users/components/user-form";
import { getUser } from "@/features/users/queries";
import { requirePagePermission } from "@/lib/auth/current-user";

type EditUserPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditUserPage({ params }: EditUserPageProps) {
  const viewer = await requirePagePermission("users.update");
  const { id } = await params;

  const user = await getUser(viewer, id);
  if (!user) notFound();

  const t = await getTranslations("users.form");

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <BackLink href={`/users/${user.id}`} label={t("backToUser")} />
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold sm:text-2xl">{t("editTitle")}</h1>
        <p className="break-words text-muted-foreground">{user.fullName}</p>
      </div>
      <UserForm user={user} viewer={viewer} />
    </div>
  );
}
