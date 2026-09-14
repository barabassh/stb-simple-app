import { ConstructionIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { StatusMessage } from "@/components/status-message";
import { requirePagePermission } from "@/lib/auth/current-user";

// The profile itself comes with the profile step; until then the route only enforces who may open it.
export default async function ProfilePage() {
  await requirePagePermission("profile.read");
  const t = await getTranslations();

  return (
    <StatusMessage
      icon={ConstructionIcon}
      title={t("profile.title")}
      description={t("common.sectionInDevelopment")}
      className="flex-1"
    />
  );
}
