import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";

export function ReferenceStatusBadge({ isActive }: { isActive: boolean }) {
  const t = useTranslations("referenceBooks.statuses");

  return (
    <Badge variant={isActive ? "secondary" : "outline"}>
      {t(isActive ? "active" : "archived")}
    </Badge>
  );
}
