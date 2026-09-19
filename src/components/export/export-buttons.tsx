import { getTranslations } from "next-intl/server";

import type { SearchParamsInput } from "@/components/data-table/search-params";
import { getExportColumnChoice } from "@/features/export/queries";
import { requireUser } from "@/lib/auth/current-user";
import type { ExportReport } from "@/lib/export";
import { exportFileHref, printHref } from "@/lib/export/links";
import { exportRefusal } from "@/lib/export/service";

import { ExportColumnsDialog, type ExportLink } from "./export-columns-dialog";

type ExportButtonsProps = {
  report: ExportReport;
  /** The search parameters of the list, so that the export takes the rows it shows. */
  searchParams: SearchParamsInput;
};

export async function ExportButtons({ report, searchParams }: ExportButtonsProps) {
  const viewer = await requireUser();
  const [t, choice, spreadsheetRefusal, printRefusal] = await Promise.all([
    getTranslations(),
    getExportColumnChoice(viewer, report),
    exportRefusal(viewer, report, "xlsx", searchParams),
    // PDF and printing share the row limit, so one count serves both.
    exportRefusal(viewer, report, "pdf", searchParams),
  ]);
  // The spreadsheet has no row limit: when it is refused, so is everything else.
  const refusal = spreadsheetRefusal ?? printRefusal;
  const refusalId = `${report.name}-export-refusal`;
  const links: ExportLink[] = [
    {
      format: "xlsx",
      label: t("export.xlsx"),
      href: exportFileHref(report.name, "xlsx", searchParams),
      refused: spreadsheetRefusal !== null,
    },
    {
      format: "pdf",
      label: t("export.pdf"),
      href: exportFileHref(report.name, "pdf", searchParams),
      refused: printRefusal !== null,
    },
    {
      format: "print",
      label: t("export.print"),
      href: printHref(report.name, searchParams),
      refused: printRefusal !== null,
    },
  ];

  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <ExportColumnsDialog
        report={report.name}
        links={links}
        choice={choice}
        refusalId={refusalId}
      />
      {refusal && (
        <p id={refusalId} className="max-w-md text-sm text-muted-foreground sm:text-right">
          {t(refusal.error, refusal.errorValues)}
        </p>
      )}
    </div>
  );
}
