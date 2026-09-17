import { SettingsIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import type { SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";

import { companyFormValues } from "../form-values";
import { getCompanyProfile } from "../queries";
import { CompanyProfileDialog } from "./company-profile-dialog";

export async function CompanyProfileBlock({ viewer }: { viewer: SessionUser }) {
  const [profile, t] = await Promise.all([
    getCompanyProfile(viewer),
    getTranslations("settings.company"),
  ]);
  const canEdit = can(viewer, "settings.company.update");
  const formValues = canEdit ? companyFormValues(profile) : null;

  return (
    <section aria-labelledby="company-profile-title" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SettingsIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <h2 id="company-profile-title" className="text-lg font-semibold">
            {t("title")}
          </h2>
        </div>
        {profile && formValues && <CompanyProfileDialog defaultValues={formValues} mode="edit" />}
      </div>

      {!profile && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
          <p className="text-muted-foreground">{t("empty")}</p>
          {formValues && <CompanyProfileDialog defaultValues={formValues} mode="fill" />}
        </div>
      )}
    </section>
  );
}
