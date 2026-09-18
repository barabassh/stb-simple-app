import { auditExport } from "@/features/audit/export";
import { contractorsExport } from "@/features/contractors/export";
import { customersExport } from "@/features/customers/export";
import { projectsExport } from "@/features/projects/export";
import { usersExport } from "@/features/users/export";
import type { ExportReport } from "@/lib/export";

// A section offers an export by describing its columns in its own export.ts and being listed here.
const EXPORT_REPORTS: readonly ExportReport[] = [
  usersExport,
  auditExport,
  customersExport,
  contractorsExport,
  projectsExport,
];

export function findExportReport(name: string | null | undefined): ExportReport | null {
  return EXPORT_REPORTS.find((report) => report.name === name) ?? null;
}
