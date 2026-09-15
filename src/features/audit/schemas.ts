import { z } from "zod";

import type { ExportRefusal } from "@/lib/export";
import { displayDayRange, formatDate, monthPeriodEnd } from "@/lib/format";

/**
 * The journal is exported for a period of at most one calendar month (docs/ТЗ.md, 4.11), set by
 * the "from" and "to" filters it shows. Messages are translation keys.
 */
export const auditExportPeriodSchema = z
  .object({ from: z.string(), to: z.string() })
  .superRefine(({ from, to }, ctx) => {
    if (!displayDayRange(from) || !displayDayRange(to)) {
      ctx.addIssue({ code: "custom", message: "audit.export.periodRequired" });
    } else if (from > to) {
      ctx.addIssue({ code: "custom", message: "audit.export.periodReversed", path: ["to"] });
    } else if (to > monthPeriodEnd(from)) {
      ctx.addIssue({ code: "custom", message: "audit.export.periodTooLong", path: ["to"] });
    }
  });

const displayDay = (day: string) => formatDate(displayDayRange(day)?.start);

export function checkAuditExportPeriod(period: { from: string; to: string }): ExportRefusal | null {
  const result = auditExportPeriodSchema.safeParse(period);
  if (result.success) return null;

  const [{ message }] = result.error.issues;
  return message === "audit.export.periodTooLong"
    ? {
        error: message,
        errorValues: {
          from: displayDay(period.from),
          latest: displayDay(monthPeriodEnd(period.from)),
        },
      }
    : { error: message };
}
