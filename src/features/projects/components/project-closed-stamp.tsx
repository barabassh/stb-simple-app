import { useTranslations } from "next-intl";

import { formatDateTime, formatShortName } from "@/lib/format";

type ProjectClosedStampProps = {
  at: Date;
  /** Null when the closing account was removed from the record, e.g. outside the application. */
  by: { fullName: string; login: string } | null;
};

/** "Закрыт: дата и время, автор" under the stamps of a closed project (docs/ТЗ.md, 6.7). */
export function ProjectClosedStamp({ at, by }: ProjectClosedStampProps) {
  const t = useTranslations("projects.card");
  const date = formatDateTime(at);

  return (
    <p className="text-sm text-muted-foreground">
      {by ? (
        <span title={`${by.fullName} (${by.login})`}>
          {t("closedBy", {
            date,
            // Like the stamps above: the line breaks before the author, not between the initials.
            author: formatShortName(by.fullName).replaceAll(" ", "\u00A0"),
          })}
        </span>
      ) : (
        t("closed", { date })
      )}
    </p>
  );
}
