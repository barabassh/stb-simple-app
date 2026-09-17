import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { readParam, TAB_SEARCH_PARAM } from "@/components/data-table/search-params";
import { Badge } from "@/components/ui/badge";
import { UrlTabs } from "@/components/url-tabs";
import { AuditTable } from "@/features/audit/components/audit-table";
import { RecordStamps } from "@/features/audit/components/record-stamps";
import { parseAuditTableState } from "@/features/audit/list-params";
import { listEntityAuditLogs } from "@/features/audit/queries";
import { BackLink } from "@/components/back-link";
import { UserCardActions } from "@/features/users/components/user-card-actions";
import { UserProfileDetails } from "@/features/users/components/user-profile-details";
import { UserSessions } from "@/features/users/components/user-sessions";
import { UserStatusBadge } from "@/features/users/components/user-status-badge";
import { getUser, listActiveUserSessions } from "@/features/users/queries";
import { requirePagePermission } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";

type UserPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const PROFILE_TAB = "profile";

export default async function UserPage({ params, searchParams }: UserPageProps) {
  const viewer = await requirePagePermission("users.read");
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);

  const user = await getUser(viewer, id);
  if (!user) notFound();

  const historyTable = parseAuditTableState(resolvedSearchParams);
  const [sessions, history, t] = await Promise.all([
    can(viewer, "users.sessions.read") ? listActiveUserSessions(viewer, id) : null,
    can(viewer, "users.history.read")
      ? listEntityAuditLogs(viewer, "User", id, historyTable)
      : null,
    getTranslations(),
  ]);

  const tabs = [
    {
      value: PROFILE_TAB,
      label: t("users.card.tabs.profile"),
      content: <UserProfileDetails user={user} />,
    },
    ...(sessions
      ? [
          {
            value: "sessions",
            label: (
              <>
                {t("users.card.tabs.sessions")}
                <Badge variant="secondary">{sessions.length}</Badge>
              </>
            ),
            content: <UserSessions userId={user.id} sessions={sessions} viewer={viewer} />,
          },
        ]
      : []),
    ...(history
      ? [
          {
            value: "history",
            label: t("users.card.tabs.history"),
            content: (
              <AuditTable
                rows={history.rows}
                rowCount={history.rowCount}
                state={historyTable}
                emptyState={t("audit.historyEmpty")}
                showEntity={false}
                showRequestInfo={can(viewer, "audit.read")}
              />
            ),
          },
        ]
      : []),
  ];

  const requestedTab = readParam(resolvedSearchParams, TAB_SEARCH_PARAM);
  const tab = tabs.find(({ value }) => value === requestedTab)?.value ?? PROFILE_TAB;

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/users" label={t("users.form.backToList")} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold break-words sm:text-2xl">
            {user.fullName}
            <UserStatusBadge isActive={user.isActive} />
          </h1>
          <p className="text-muted-foreground">
            {user.login} · {t(`users.roles.${user.role}`)}
          </p>
          <RecordStamps
            created={{ at: user.createdAt, by: user.createdBy }}
            updated={{ at: user.updatedAt, by: user.updatedBy }}
          />
        </div>
        <UserCardActions
          user={{
            id: user.id,
            login: user.login,
            fullName: user.fullName,
            role: user.role,
            isActive: user.isActive,
          }}
          viewer={viewer}
        />
      </div>

      <UrlTabs value={tab} defaultValue={PROFILE_TAB} tabs={tabs} />
    </div>
  );
}
