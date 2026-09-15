import { useTranslations } from "next-intl";
import { Fragment } from "react";

/** `key` names the label in `users.fields`; an empty value reads as "not set". */
export type UserFieldRow = { key: string; value: React.ReactNode };

export function UserFieldList({ rows }: { rows: UserFieldRow[] }) {
  const t = useTranslations("users");

  return (
    <dl className="grid gap-x-6 rounded-xl border p-4 sm:grid-cols-[12rem_1fr] sm:gap-y-3">
      {rows.map(({ key, value }) => (
        <Fragment key={key}>
          <dt className="text-muted-foreground">{t(`fields.${key}`)}</dt>
          <dd className="mb-3 break-words whitespace-pre-wrap last:mb-0 sm:mb-0">
            {value ?? <span className="text-muted-foreground">{t("card.notSet")}</span>}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}
