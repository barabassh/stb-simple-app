import { Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";

export default function AppLoading() {
  const t = useTranslations("common");

  return (
    <div
      role="status"
      className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"
    >
      <Loader2Icon className="size-4 animate-spin" aria-hidden />
      {t("loading")}
    </div>
  );
}
