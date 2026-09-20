import { getTranslations } from "next-intl/server";

import { BackLink } from "@/components/back-link";
import { ImportForm } from "@/components/import/import-form";
import { reportsImport } from "@/features/reports/import";
import { requirePagePermission } from "@/lib/auth/current-user";

/** Importing reports from Excel is for administrators and managers only (docs/ТЗ.md, 7.13). */
export default async function ReportsImportPage() {
  await requirePagePermission(reportsImport.permission);
  const t = await getTranslations("reports.import");

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/reports" label={t("backToList")} />
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold sm:text-2xl">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <ImportForm
        name={reportsImport.name}
        options={[{ name: "approve", label: t("approveAtOnce") }]}
        confirmKey="reports.import.confirm"
        writtenKey="reports.import.written"
        doneHref="/reports"
      />
    </div>
  );
}
