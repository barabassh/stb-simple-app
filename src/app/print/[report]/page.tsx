import { ArrowLeftIcon, CalendarRangeIcon } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PrintReport } from "@/components/export/print-report";
import { StatusMessage } from "@/components/status-message";
import { Button } from "@/components/ui/button";
import { findExportReport } from "@/features/export/reports";
import { FORBIDDEN_PATH } from "@/lib/auth/constants";
import { requireUser } from "@/lib/auth/current-user";
import { listHref } from "@/lib/export/links";
import { logExport, prepareExport } from "@/lib/export/service";
import { can } from "@/lib/permissions";

type PrintPageProps = {
  params: Promise<{ report: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Outside the (app) layout: the sheet carries the report alone, without the menu and the header.
export default async function PrintPage({ params, searchParams }: PrintPageProps) {
  const viewer = await requireUser();
  const report = findExportReport((await params).report);
  if (!report) notFound();
  if (!can(viewer, report.permission)) redirect(FORBIDDEN_PATH);

  const resolvedSearchParams = await searchParams;
  const backHref = listHref(report.path, resolvedSearchParams);

  const refusal = report.checkParams?.(resolvedSearchParams);
  if (refusal) {
    const t = await getTranslations();
    return (
      <StatusMessage
        icon={CalendarRangeIcon}
        title={t("export.unavailable")}
        description={t(refusal.error, refusal.errorValues)}
        className="min-h-svh"
      >
        <Button variant="outline" asChild>
          <a href={backHref}>
            <ArrowLeftIcon aria-hidden />
            {t("export.back")}
          </a>
        </Button>
      </StatusMessage>
    );
  }

  const content = await prepareExport(viewer, report, resolvedSearchParams);
  // Printing hands the data over on paper just as a file does, so it is logged as an export too.
  await logExport(viewer, report, "print", content);

  return <PrintReport content={content} backHref={backHref} />;
}
