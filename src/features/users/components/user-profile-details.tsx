import Link from "next/link";
import { useTranslations } from "next-intl";

import { formatDateTime } from "@/lib/format";

import type { UserDetails } from "../queries";
import { UserFieldList, type UserFieldRow } from "./user-field-list";
import { UserStatusBadge } from "./user-status-badge";

type UserProfileDetailsProps = {
  user: UserDetails;
  /** The organisation is a link to the contractor card for those who may open it. */
  canOpenContractor: boolean;
};

export function UserProfileDetails({ user, canOpenContractor }: UserProfileDetailsProps) {
  const t = useTranslations("users");
  const tReference = useTranslations("referenceBooks");
  const { contractor } = user;
  const contractorName =
    contractor &&
    (contractor.isActive ? contractor.name : tReference("archivedMark", { name: contractor.name }));

  const rows: UserFieldRow[] = [
    { key: "login", value: user.login },
    { key: "fullName", value: user.fullName },
    { key: "position", value: user.position },
    { key: "email", value: user.email },
    { key: "phone", value: user.phone },
    { key: "role", value: t(`roles.${user.role}`) },
    // Only a contractor account belongs to an organisation (docs/ТЗ.md, 6.5).
    ...(user.role === "CONTRACTOR" || contractor
      ? [
          {
            key: "contractor",
            value:
              contractor && canOpenContractor ? (
                <Link
                  href={`/contractors/${contractor.id}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {contractorName}
                </Link>
              ) : (
                contractorName
              ),
          },
        ]
      : []),
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
