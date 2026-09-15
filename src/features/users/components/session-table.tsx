import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { describeUserAgent } from "@/lib/user-agent";

import type { UserSessionItem } from "../queries";

type SessionTableProps = {
  sessions: UserSessionItem[];
  /** The session the page was requested with, marked in the list. */
  currentSessionId?: string;
  renderActions?: (session: UserSessionItem) => React.ReactNode;
};

/** Active sessions of one user: in the user card and in one's own profile. */
export function SessionTable({ sessions, currentSessionId, renderActions }: SessionTableProps) {
  const t = useTranslations("users.sessions");

  if (sessions.length === 0) {
    return <p className="rounded-xl border p-8 text-center text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t("startedAt")}</TableHead>
            <TableHead>{t("ip")}</TableHead>
            <TableHead>{t("browser")}</TableHead>
            <TableHead>{t("lastActiveAt")}</TableHead>
            {renderActions && (
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
                <span className="inline-flex items-center gap-2">
                  {describeUserAgent(session.userAgent) ?? t("unknownBrowser")}
                  {session.id === currentSessionId && (
                    <Badge variant="secondary">{t("current")}</Badge>
                  )}
                </span>
              </TableCell>
              <TableCell>{formatDateTime(session.lastActiveAt)}</TableCell>
              {renderActions && (
                <TableCell className="text-right">{renderActions(session)}</TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
