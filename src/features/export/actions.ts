"use server";

import { z } from "zod";

import { exportPreference, writeTableSettings } from "@/features/preferences/store";
import type { ActionResult } from "@/lib/action-result";
import { authorizedAction } from "@/lib/auth/authorized-action";
import { can, PermissionDeniedError } from "@/lib/permissions";

import { orderColumns } from "./queries";
import { EXPORT_PERMISSIONS, findExportReport } from "./reports";

const exportColumnsSchema = z.object({
  report: z.string().max(40),
  hidden: z.array(z.string().max(40)).max(50),
  order: z.array(z.string().max(40)).max(50),
});

/**
 * The columns the user left out of an export and the order of the columns, offered the same way
 * the next time (docs/ТЗ.md, 4.11).
 * A display setting of the user's own, like the column settings of a table: no audit entry
 * (docs/СХЕМА-БД.md, 10.2). Columns the report does not offer the user are dropped.
 */
export const saveExportColumns = authorizedAction(
  EXPORT_PERMISSIONS,
  async (actor, input: unknown): Promise<ActionResult> => {
    const parsed = exportColumnsSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "errors.invalidRequest" };
    const report = findExportReport(parsed.data.report);
    if (!report) return { ok: false, error: "errors.invalidRequest" };
    if (!can(actor, report.permission)) throw new PermissionDeniedError(report.permission);

    const offered = (await report.columns(actor)).map((column) => column.key);
    const hidden = offered.filter((key) => parsed.data.hidden.includes(key));
    const columnOrder = orderColumns(offered, parsed.data.order);
    await writeTableSettings(actor.id, exportPreference(report.name), {
      hiddenColumns: hidden,
      columnOrder,
    });
    return { ok: true };
  },
);
