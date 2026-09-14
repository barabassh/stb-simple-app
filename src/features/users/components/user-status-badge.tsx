import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";

export function UserStatusBadge({ isActive }: { isActive: boolean }) {
  const t = useTranslations("users.statuses");

  return (
    <Badge variant={isActive ? "secondary" : "outline"}>
      {t(isActive ? "active" : "inactive")}
    </Badge>
  );
}
