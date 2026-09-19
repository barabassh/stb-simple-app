import { useTranslations } from "next-intl";

import { ACTIVE_STATUS_CLASS, INACTIVE_STATUS_CLASS } from "@/components/status-colors";
import { Badge } from "@/components/ui/badge";

export function UserStatusBadge({ isActive }: { isActive: boolean }) {
  const t = useTranslations("users.statuses");

  return (
    <Badge variant="outline" className={isActive ? ACTIVE_STATUS_CLASS : INACTIVE_STATUS_CLASS}>
      {t(isActive ? "active" : "inactive")}
    </Badge>
  );
}
