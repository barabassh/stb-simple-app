import { FileSpreadsheetIcon, FileTextIcon, PrinterIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import type { SearchParamsInput } from "@/components/data-table/search-params";
import { Button } from "@/components/ui/button";
import type { ExportReport } from "@/lib/export";
import { exportFileHref, printHref } from "@/lib/export/links";

type ExportButtonsProps = {
  report: Pick<ExportReport, "name" | "checkParams">;
  /** The search parameters of the list, so that the export takes the rows it shows. */
  searchParams: SearchParamsInput;
};

// Plain links rather than next/link: a prefetched print view would log an export nobody made.
export async function ExportButtons({ report, searchParams }: ExportButtonsProps) {
  const t = await getTranslations();
  const refusal = report.checkParams?.(searchParams) ?? null;
  const refusalId = `${report.name}-export-refusal`;
  const links = [
    {
      href: exportFileHref(report.name, "xlsx", searchParams),
      label: t("export.xlsx"),
      Icon: FileSpreadsheetIcon,
    },
    {
      href: exportFileHref(report.name, "pdf", searchParams),
      label: t("export.pdf"),
      Icon: FileTextIcon,
    },
    { href: printHref(report.name, searchParams), label: t("export.print"), Icon: PrinterIcon },
  ];

  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <div className="flex flex-wrap gap-2">
        {links.map(({ href, label, Icon }) =>
          refusal ? (
            // A link cannot be disabled, so a refused export is shown as a disabled button.
            <Button key={label} variant="outline" disabled aria-describedby={refusalId}>
              <Icon aria-hidden />
              {label}
            </Button>
          ) : (
            <Button key={label} variant="outline" asChild>
              <a href={href}>
                <Icon aria-hidden />
                {label}
              </a>
            </Button>
          ),
        )}
      </div>
      {refusal && (
        <p id={refusalId} className="max-w-md text-sm text-muted-foreground sm:text-right">
          {t(refusal.error, refusal.errorValues)}
        </p>
      )}
    </div>
  );
}
