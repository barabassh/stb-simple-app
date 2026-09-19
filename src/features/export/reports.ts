import { auditExport } from "@/features/audit/export";
import { contractorsExport } from "@/features/contractors/export";
import { customersExport } from "@/features/customers/export";
import { projectsExport } from "@/features/projects/export";
import { reportsExport } from "@/features/reports/export";
import { usersExport } from "@/features/users/export";
import type { ExportReport } from "@/lib/export";
import type { Permission } from "@/lib/permissions";

// A section offers an export by describing its columns in its own export.ts and being listed here.
const EXPORT_REPORTS: readonly ExportReport[] = [
  usersExport,
  auditExport,
  customersExport,
  contractorsExport,
  projectsExport,
  reportsExport,
];

/** The permissions of every report: any of them lets a user save their choice of columns. */
export const EXPORT_PERMISSIONS: readonly Permission[] = [
  ...new Set(EXPORT_REPORTS.map((report) => report.permission)),
];

export function findExportReport(name: string | null | undefined): ExportReport | null {
  return EXPORT_REPORTS.find((report) => report.name === name) ?? null;
}
