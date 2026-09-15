import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { findExportReport } from "@/features/export/reports";
import { FORBIDDEN_PATH } from "@/lib/auth/constants";
import { requireUser } from "@/lib/auth/current-user";
import { EXPORT_FILE_FORMATS, type ExportDocument, type ExportFileFormat } from "@/lib/export";
import { EXPORT_REPORT_PARAM } from "@/lib/export/links";
import { renderPdf } from "@/lib/export/pdf";
import { logExport, prepareExport } from "@/lib/export/service";
import { renderXlsx } from "@/lib/export/xlsx";
import { can } from "@/lib/permissions";

const FILE_TYPES: Record<
  ExportFileFormat,
  { contentType: string; render: (content: ExportDocument) => Promise<Buffer> }
> = {
  xlsx: {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    render: renderXlsx,
  },
  pdf: { contentType: "application/pdf", render: renderPdf },
};

type ExportRouteContext = { params: Promise<{ format: string }> };

export async function GET(request: NextRequest, { params }: ExportRouteContext) {
  const viewer = await requireUser();
  const { searchParams } = request.nextUrl;
  const { format: formatParam } = await params;
  const format = EXPORT_FILE_FORMATS.find((value) => value === formatParam);
  const report = findExportReport(searchParams.get(EXPORT_REPORT_PARAM));
  if (!format || !report) return new Response(null, { status: 404 });
  // A link can be forwarded to anyone, so a user without access gets the page a section gives.
  if (!can(viewer, report.permission)) redirect(FORBIDDEN_PATH);
  const refusal = report.checkParams?.(searchParams);
  if (refusal) {
    // The buttons are not offered for such parameters, so only an edited link gets here.
    const t = await getTranslations();
    return new Response(t(refusal.error, refusal.errorValues), {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const content = await prepareExport(viewer, report, searchParams);
  const file = await FILE_TYPES[format].render(content);
  await logExport(viewer, report, format, content);

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": FILE_TYPES[format].contentType,
      "Content-Disposition": `attachment; filename="${content.fileName}.${format}"`,
      "Cache-Control": "no-store",
    },
  });
}
