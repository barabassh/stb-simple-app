import { FileQuestionIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { StatusMessage } from "@/components/status-message";
import { Button } from "@/components/ui/button";
import { HOME_PATH } from "@/lib/auth/constants";

export async function NotFoundMessage({ className }: { className?: string }) {
  const t = await getTranslations("errors");

  return (
    <StatusMessage
      icon={FileQuestionIcon}
      title={t("notFound.title")}
      description={t("notFound.description")}
      className={className}
    >
      <Button asChild>
        <Link href={HOME_PATH}>{t("backHome")}</Link>
      </Button>
    </StatusMessage>
  );
}
