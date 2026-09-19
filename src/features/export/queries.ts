import { exportPreference, readTableSettings } from "@/features/preferences/store";
import type { SessionUser } from "@/lib/auth/session";
import type { ExportReport } from "@/lib/export";
import { requirePermission } from "@/lib/permissions";

export type ExportColumnChoice = {
  /** Every column the user may export, in the order the user put them in last time. */
  columns: { key: string; header: string }[];
  /** Those the user left out last time, unticked when the dialog opens. */
  hidden: string[];
  /** The report's own order, which a file takes unless the link names another. */
  reportOrder: string[];
};

/**
 * The keys in the saved order: keys no longer offered are dropped, and those added to the report
 * since come after the saved ones, in the report's order.
 */
export function orderColumns(keys: readonly string[], saved: readonly string[]): string[] {
  const known = [...new Set(saved)].filter((key) => keys.includes(key));
  return [...known, ...keys.filter((key) => !known.includes(key))];
}

/** What the export dialog offers (docs/ТЗ.md, 4.11). */
export async function getExportColumnChoice(
  actor: SessionUser,
  report: ExportReport,
): Promise<ExportColumnChoice> {
  requirePermission(actor, report.permission);

  const [columns, settings] = await Promise.all([
    report.columns(actor),
    readTableSettings(actor.id, exportPreference(report.name)),
  ]);
  const keys = columns.map((column) => column.key);
  const hidden = settings.hiddenColumns.filter((key) => keys.includes(key));

  return {
    columns: orderColumns(keys, settings.columnOrder).map((key) => {
      const { header } = columns.find((column) => column.key === key)!;
      return { key, header };
    }),
    // A choice that leaves nothing out is no choice: every column is offered again.
    hidden: hidden.length < keys.length ? hidden : [],
    reportOrder: keys,
  };
}
