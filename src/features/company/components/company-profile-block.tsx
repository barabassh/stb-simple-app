import { HistoryIcon, SettingsIcon } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { DetailsGroup } from "@/components/details/details-group";
import { Button } from "@/components/ui/button";
import { RecordStamps } from "@/features/audit/components/record-stamps";
import type { SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";

import { companyDetailGroups } from "../details";
import { companyFormValues } from "../form-values";
import { getCompanyProfile } from "../queries";
import { CompanyProfileDialog } from "./company-profile-dialog";

const COMPANY_HISTORY_PATH = "/settings/company/history";

export async function CompanyProfileBlock({ viewer }: { viewer: SessionUser }) {
  const [profile, t, locale] = await Promise.all([
    getCompanyProfile(viewer),
    getTranslations(),
    getLocale(),
  ]);
  const canEdit = can(viewer, "settings.company.update");
  const formValues = canEdit ? companyFormValues(profile) : null;

  return (
    <section aria-labelledby="company-profile-title" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <SettingsIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <h2 id="company-profile-title" className="text-lg font-semibold">
              {t("settings.company.title")}
            </h2>
          </div>
          {profile && (
            <RecordStamps
              created={{ at: profile.createdAt, by: profile.createdBy }}
              updated={{ at: profile.updatedAt, by: profile.updatedBy }}
            />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can(viewer, "settings.company.history") && (
            <Button variant="ghost" asChild>
              <Link href={COMPANY_HISTORY_PATH}>
                <HistoryIcon aria-hidden />
                {t("settings.company.historyLink")}
              </Link>
            </Button>
          )}
          {profile && formValues && <CompanyProfileDialog defaultValues={formValues} mode="edit" />}
        </div>
      </div>

      {profile ? (
        companyDetailGroups(profile, t, locale).map((group) => (
          <DetailsGroup key={group.key} group={group} />
        ))
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
          <p className="text-muted-foreground">{t("settings.company.empty")}</p>
          {formValues && <CompanyProfileDialog defaultValues={formValues} mode="fill" />}
        </div>
      )}
    </section>
  );
}
