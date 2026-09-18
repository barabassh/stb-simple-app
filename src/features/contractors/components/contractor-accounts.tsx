import Link from "next/link";
import { useTranslations } from "next-intl";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserStatusBadge } from "@/features/users/components/user-status-badge";
import type { ContractorUserItem } from "@/features/users/queries";

/** The "Учётные записи" tab: the accounts linked to the contractor (docs/ТЗ.md, 6.5). */
export function ContractorAccounts({ users }: { users: ContractorUserItem[] }) {
  const t = useTranslations();

  if (users.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        {t("contractors.card.accountsEmpty")}
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t("users.fields.login")}</TableHead>
            <TableHead>{t("users.fields.fullName")}</TableHead>
            <TableHead>{t("users.fields.status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                <Link
                  href={`/users/${user.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {user.login}
                </Link>
              </TableCell>
              <TableCell>{user.fullName}</TableCell>
              <TableCell>
                <UserStatusBadge isActive={user.isActive} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
