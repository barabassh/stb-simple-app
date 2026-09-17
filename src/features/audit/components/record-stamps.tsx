import { useTranslations } from "next-intl";

import { formatDateTime, formatShortName } from "@/lib/format";

type Stamp = {
  at: Date;
  /** Null when the record was made outside the application, e.g. by the seed. */
  by: { fullName: string; login: string } | null;
};

/** "Создано: дата, автор · Изменено: дата, автор" under the title of a card (docs/ТЗ.md, 4.10). */
export function RecordStamps({ created, updated }: { created: Stamp; updated: Stamp }) {
  const t = useTranslations("audit.stamps");

  function render(stamp: Stamp, withoutAuthor: string, withAuthor: string) {
    const date = formatDateTime(stamp.at);
    if (!stamp.by) return t(withoutAuthor, { date });
    return (
      <span title={`${stamp.by.fullName} (${stamp.by.login})`}>
        {t(withAuthor, {
          date,
          // On a phone the line breaks before the author rather than between the initials.
          author: formatShortName(stamp.by.fullName).replaceAll(" ", "\u00A0"),
        })}
      </span>
    );
  }

  return (
    <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
      <span>{render(created, "created", "createdBy")}</span>
      {/* On a narrow screen the two stamps take a line each and the separator would hang alone. */}
      <span aria-hidden className="hidden sm:inline">
        ·
      </span>
      <span>{render(updated, "updated", "updatedBy")}</span>
    </p>
  );
}
