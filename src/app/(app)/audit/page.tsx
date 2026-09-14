import { ConstructionIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { StatusMessage } from "@/components/status-message";
import { requirePagePermission } from "@/lib/auth/current-user";

// The journal itself comes with the audit step; until then the route only enforces who may open it.
export default async function AuditPage() {
  await requirePagePermission("audit.read");
  const t = await getTranslations();

  return (
    <StatusMessage
      icon={ConstructionIcon}
      title={t("audit.title")}
      description={t("common.sectionInDevelopment")}
      className="flex-1"
    />
  );
}
