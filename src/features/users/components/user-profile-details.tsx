import { useTranslations } from "next-intl";
import { Fragment } from "react";

import { formatDateTime } from "@/lib/format";

import type { UserDetails } from "../queries";
import { UserStatusBadge } from "./user-status-badge";

export function UserProfileDetails({ user }: { user: UserDetails }) {
  const t = useTranslations("users");

  const rows: { key: string; value: React.ReactNode }[] = [
    { key: "login", value: user.login },
    { key: "fullName", value: user.fullName },
    { key: "position", value: user.position },
    { key: "email", value: user.email },
    { key: "phone", value: user.phone },
    { key: "role", value: t(`roles.${user.role}`) },
    { key: "status", value: <UserStatusBadge isActive={user.isActive} /> },
    {
      key: "lastLoginAt",
      value: user.lastLoginAt ? formatDateTime(user.lastLoginAt) : t("card.neverLoggedIn"),
    },
    { key: "createdAt", value: formatDateTime(user.createdAt) },
    { key: "comment", value: user.comment },
  ];

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
