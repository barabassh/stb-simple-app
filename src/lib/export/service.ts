import { getTranslations } from "next-intl/server";

import type { SearchParamsInput } from "@/components/data-table/search-params";
import { logAudit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { getClientInfo } from "@/lib/request-info";

import type { ExportDocument, ExportFormat, ExportReport } from ".";

// The permission of the report is checked by the caller to choose the response, and again by the
// query the report reads with.

export async function prepareExport(
  actor: SessionUser,
  report: ExportReport,
  searchParams: SearchParamsInput,
): Promise<ExportDocument> {
  const [table, t] = await Promise.all([
    report.load(actor, searchParams),
    getTranslations("export"),
  ]);
  const generatedAt = new Date();

  return {
    ...table,
    fileName: `${report.name}_${formatDate(generatedAt)}`,
    generatedAt,
    labels: {
      generatedAt: t("generatedAt", { date: formatDateTime(generatedAt) }),
      author: t("author", { name: actor.fullName, login: actor.login }),
      empty: t("empty"),
      page: (page, pages) => t("page", { page, pages }),
    },
  };
}

/**
 * Called once the file is ready, so that a failed export leaves no entry. An export changes no
 * data, so there is no transaction for the entry to join.
 */
export async function logExport(
  actor: SessionUser,
  report: ExportReport,
  format: ExportFormat,
  content: ExportDocument,
): Promise<void> {
  const [t, request] = await Promise.all([getTranslations(), getClientInfo()]);

  await logAudit(db, {
    ...request,
    actor,
    action: "EXPORT",
    entity: report.entity,
    summary: t("audit.summaries.exported", {
      title: content.title,
      format: t(`export.formats.${format}`),
      count: content.rows.length,
    }),
  });
}
