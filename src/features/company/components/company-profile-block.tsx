import { SettingsIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/lib/auth/session";

import { getCompanyProfile } from "../queries";

export async function CompanyProfileBlock({ viewer }: { viewer: SessionUser }) {
  const [profile, t] = await Promise.all([
    getCompanyProfile(viewer),
    getTranslations("settings.company"),
  ]);

  return (
    <section aria-labelledby="company-profile-title" className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <SettingsIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <h2 id="company-profile-title" className="text-lg font-semibold">
          {t("title")}
        </h2>
      </div>

      {!profile && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
          <p className="text-muted-foreground">{t("empty")}</p>
          <Button disabled>{t("fill")}</Button>
        </div>
      )}
    </section>
  );
}
