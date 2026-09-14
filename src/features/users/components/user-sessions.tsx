import { useTranslations } from "next-intl";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SessionUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { describeUserAgent } from "@/lib/user-agent";

import type { UserSessionItem } from "../queries";
import { RevokeAllSessionsButton, RevokeSessionButton } from "./user-session-actions";

type UserSessionsProps = {
  userId: string;
  sessions: UserSessionItem[];
  viewer: Pick<SessionUser, "role">;
};

export function UserSessions({ userId, sessions, viewer }: UserSessionsProps) {
  const t = useTranslations("users.sessions");
  const canRevoke = can(viewer, "users.sessions.revoke");

  if (sessions.length === 0) {
    return <p className="rounded-xl border p-8 text-center text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {canRevoke && (
        <div className="flex justify-end">
          <RevokeAllSessionsButton userId={userId} />
        </div>
      )}
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("startedAt")}</TableHead>
              <TableHead>{t("ip")}</TableHead>
              <TableHead>{t("browser")}</TableHead>
              <TableHead>{t("lastActiveAt")}</TableHead>
              {canRevoke && (
                <TableHead>
                  <span className="sr-only">{t("actions")}</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell>{formatDateTime(session.createdAt)}</TableCell>
                <TableCell>{session.ip ?? "—"}</TableCell>
                <TableCell title={session.userAgent ?? undefined}>
                  {describeUserAgent(session.userAgent) ?? t("unknownBrowser")}
                </TableCell>
                <TableCell>{formatDateTime(session.lastActiveAt)}</TableCell>
                {canRevoke && (
                  <TableCell className="text-right">
                    <RevokeSessionButton userId={userId} sessionId={session.id} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
