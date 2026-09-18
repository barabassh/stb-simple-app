import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { ProjectStatus } from "@/generated/prisma/enums";

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const t = useTranslations("projects.statuses");

  return <Badge variant={status === "IN_PROGRESS" ? "secondary" : "outline"}>{t(status)}</Badge>;
}
