import { getTranslations } from "next-intl/server";

import type { AuditValue } from "@/lib/audit";
import { defineExportReport } from "@/lib/export";
import { describeUserAgent } from "@/lib/user-agent";

import { parseAuditListParams } from "./list-params";
import { countAuditLogsForExport, listAuditLogsForExport } from "./queries";
import { checkAuditExportPeriod } from "./schemas";

type AuditExportRow = {
  at: Date;
  actorLogin: string;
  actorName: string | null;
  action: string;
  entity: string;
  summary: string;
  changes: string;
  ip: string | null;
  browser: string | null;
};

/**
 * The journal with the details of its expanded rows. The id of the record is left out: for a
 * session it is the id of that session.
 */
export const auditExport = defineExportReport<AuditExportRow>({
  name: "audit",
  path: "/audit",
  permission: "audit.export",
  entity: "AuditLog",
  count: (actor, searchParams) =>
    countAuditLogsForExport(actor, parseAuditListParams(searchParams)),
  checkParams(searchParams) {
    return checkAuditExportPeriod(parseAuditListParams(searchParams));
  },
  async columns() {
    const t = await getTranslations("audit");
    return [
      { key: "at", header: t("columns.at"), format: "datetime" },
      { key: "actorLogin", header: t("columns.actor") },
      { key: "actorName", header: t("export.actorName") },
      { key: "action", header: t("columns.action") },
      { key: "entity", header: t("columns.entity") },
      { key: "summary", header: t("columns.summary") },
      { key: "changes", header: t("details.changes") },
      { key: "ip", header: t("details.ip") },
      { key: "browser", header: t("details.browser") },
    ];
  },
  async load(actor, searchParams) {
    const [t, entries] = await Promise.all([
      getTranslations("audit"),
      listAuditLogsForExport(actor, parseAuditListParams(searchParams)),
    ]);

    // An entity or a field without a label (added to the model later) is shown by its name.
    const label = (key: string, name: string) => (t.has(key) ? t(key) : name);
    const value = (item: AuditValue) =>
      item === null || item === "" ? t("details.notSet") : String(item);

    return {
      title: t("export.title"),
      rows: entries.map((entry) => ({
        at: entry.at,
        actorLogin: entry.actorLogin,
        actorName: entry.actorName,
        action: t(`actions.${entry.action}`),
        entity: label(`entities.${entry.entity}`, entry.entity),
        summary: entry.summary,
        changes: entry.changes
          .map((change) => {
            const field = label(`fields.${entry.entity}.${change.field}`, change.field);
            return change.withheld
              ? t("export.withheldChange", { field })
              : t("export.change", {
                  field,
                  before: value(change.before),
                  after: value(change.after),
                });
          })
          .join("\n"),
        ip: entry.ip,
        browser: describeUserAgent(entry.userAgent) ?? entry.userAgent,
      })),
    };
  },
});
