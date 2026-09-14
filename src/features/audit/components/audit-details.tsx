import { useTranslations } from "next-intl";

import type { AuditValue } from "@/lib/audit";
import { describeUserAgent } from "@/lib/user-agent";
import { cn } from "@/lib/utils";

import type { AuditLogItem } from "../queries";

function ChangeValue({ value, className }: { value: AuditValue; className?: string }) {
  const t = useTranslations("audit.details");

  if (value === null || value === "") {
    return <span className="text-muted-foreground italic">{t("notSet")}</span>;
  }
  return <span className={cn("break-words whitespace-pre-wrap", className)}>{String(value)}</span>;
}

type AuditDetailsProps = {
  entry: AuditLogItem;
  /** Off when the query withheld the IP address and browser from this reader. */
  showRequestInfo: boolean;
};

export function AuditDetails({ entry, showRequestInfo }: AuditDetailsProps) {
  const t = useTranslations("audit");

  // A field without a label (added to the model later) is shown by its name rather than hidden.
  const fieldLabel = (field: string) => {
    const key = `fields.${entry.entity}.${field}`;
    return t.has(key) ? t(key) : field;
  };

  const meta = [
    ...(showRequestInfo
      ? [
          { key: "ip", value: entry.ip },
          {
            key: "browser",
            value: entry.userAgent && (
              <span title={entry.userAgent}>
                {describeUserAgent(entry.userAgent) ?? entry.userAgent}
              </span>
            ),
          },
        ]
      : []),
    { key: "entityId", value: entry.entityId },
  ];

  return (
    <div className="flex max-w-3xl flex-col gap-3 py-1">
      {entry.changes.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h3 className="font-medium">{t("details.changes")}</h3>
          <ul className="flex flex-col gap-1.5">
            {entry.changes.map((change) => (
              <li key={change.field} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-muted-foreground">{fieldLabel(change.field)}:</span>
                <ChangeValue value={change.before} className="text-muted-foreground" />
                <span aria-hidden>→</span>
                <ChangeValue value={change.after} className="font-medium" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <dl className="grid gap-x-4 gap-y-1 text-muted-foreground sm:grid-cols-[max-content_1fr]">
        {meta.map(({ key, value }) => (
          <div key={key} className="contents">
            <dt>{t(`details.${key}`)}</dt>
            <dd className="mb-1 break-all text-foreground sm:mb-0">{value || "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
