import { useTranslations } from "next-intl";

import { formatDecimal, formatNumber } from "@/lib/format";

import type { ProjectReportTotals as Totals } from "../queries";
import { formatHours } from "../time";

type ProjectReportTotalsProps = {
  totals: Totals;
  /** Of every report of the project, or of the reader's own (docs/ТЗ.md, 7.11). */
  own: boolean;
};

/** Over the "Отчёты" tab of a project card; the table's filters do not narrow them. */
export function ProjectReportTotals({ totals, own }: ProjectReportTotalsProps) {
  const t = useTranslations("reports.project");
  const { budget } = totals;

  return (
    <div role="status" className="flex flex-col gap-1 rounded-lg border px-4 py-3 text-sm">
      <span className="font-medium">{t(own ? "totalsTitleOwn" : "totalsTitle")}</span>
      <span className="text-muted-foreground">
        {t("totals", {
          count: formatNumber(totals.count),
          approvedHours: formatHours(totals.approvedMinutes),
          hours: formatHours(totals.minutes),
          approvedKm: formatNumber(totals.approvedMileageKm),
          km: formatNumber(totals.mileageKm),
        })}
      </span>
      {budget && (
        <span className="text-muted-foreground">
          {t("budget", { hours: formatDecimal(budget.hours, { minimumFractionDigits: 2 }) })}
          {" · "}
          {budget.use.exceeded ? (
            <span className="font-medium text-destructive">
              {t("budgetExceeded", { hours: budget.use.excess })}
            </span>
          ) : (
            t("budgetUsed", { percent: budget.use.percent })
          )}
        </span>
      )}
    </div>
  );
}
