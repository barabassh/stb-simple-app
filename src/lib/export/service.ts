import { getTranslations } from "next-intl/server";

import type { SearchParamsInput } from "@/components/data-table/search-params";
import { logAudit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { getClientInfo } from "@/lib/request-info";

import { readExportColumns } from "./links";

import {
  chooseColumns,
  isRowLimited,
  PRINT_ROW_LIMIT,
  type ExportDocument,
  type ExportFormat,
  type ExportRefusal,
  type ExportReport,
} from ".";

// The permission of the report is checked by the caller to choose the response, and again by the
// query the report reads with.

/**
 * Why the report is not made in this format with these parameters, or null: its own condition
 * first, then the row limit of PDF and printing, counted without reading the rows. Every report
 * gets the limit from here rather than from a check of its own (docs/АРХИТЕКТУРА.md, 5).
 */
export async function exportRefusal(
  actor: SessionUser,
  report: ExportReport,
  format: ExportFormat,
  searchParams: SearchParamsInput,
): Promise<ExportRefusal | null> {
  const refusal = report.checkParams?.(searchParams);
  if (refusal) return refusal;
  if (!isRowLimited(format)) return null;

  const rowCount = await report.count(actor, searchParams);
  return rowCount > PRINT_ROW_LIMIT
    ? { error: "export.tooManyRows", errorValues: { limit: formatNumber(PRINT_ROW_LIMIT) } }
    : null;
}

export type PreparedExport = { refusal: ExportRefusal } | { content: ExportDocument };

/** The document to render, or why it is refused; nothing is read when it is refused. */
export async function prepareExport(
  actor: SessionUser,
  report: ExportReport,
  format: ExportFormat,
  searchParams: SearchParamsInput,
): Promise<PreparedExport> {
  const refusal = await exportRefusal(actor, report, format, searchParams);
  if (refusal) return { refusal };

  const [columns, data, t] = await Promise.all([
    report.columns(actor),
    report.load(actor, searchParams),
    getTranslations("export"),
  ]);
  const generatedAt = new Date();

  const content: ExportDocument = {
    ...data,
    columns: chooseColumns(columns, readExportColumns(searchParams)),
    fileName: `${report.name}_${formatDate(generatedAt)}`,
    generatedAt,
    labels: {
      generatedAt: t("generatedAt", { date: formatDateTime(generatedAt) }),
      author: t("author", { name: actor.fullName, login: actor.login }),
      empty: t("empty"),
      totals: t("totals"),
      page: (page, pages) => t("page", { page, pages }),
    },
  };
  return { content };
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
