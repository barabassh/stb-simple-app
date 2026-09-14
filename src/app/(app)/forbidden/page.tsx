import { ShieldXIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { StatusMessage } from "@/components/status-message";
import { Button } from "@/components/ui/button";
import { HOME_PATH } from "@/lib/auth/constants";
import { requireUser } from "@/lib/auth/current-user";

export default async function ForbiddenPage() {
  await requireUser();
  const t = await getTranslations("errors");

  return (
    <StatusMessage
      icon={ShieldXIcon}
      title={t("forbidden.title")}
      description={t("forbidden.description")}
      className="flex-1"
    >
      <Button asChild>
        <Link href={HOME_PATH}>{t("backHome")}</Link>
      </Button>
    </StatusMessage>
  );
}
