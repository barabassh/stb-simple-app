import { useTranslations } from "next-intl";

import { formatDateTime } from "@/lib/format";

import type { UserDetails } from "../queries";
import { UserFieldList, type UserFieldRow } from "./user-field-list";
import { UserStatusBadge } from "./user-status-badge";

export function UserProfileDetails({ user }: { user: UserDetails }) {
  const t = useTranslations("users");

  const rows: UserFieldRow[] = [
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

  return <UserFieldList rows={rows} />;
}
