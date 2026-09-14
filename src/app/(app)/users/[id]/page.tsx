import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BackLink } from "@/features/users/components/back-link";
import { UserCardActions } from "@/features/users/components/user-card-actions";
import { UserProfileDetails } from "@/features/users/components/user-profile-details";
import { UserSessions } from "@/features/users/components/user-sessions";
import { UserStatusBadge } from "@/features/users/components/user-status-badge";
import { getUser, listActiveUserSessions } from "@/features/users/queries";
import { requireUser } from "@/lib/auth/current-user";

type UserPageProps = {
  params: Promise<{ id: string }>;
};

export default async function UserPage({ params }: UserPageProps) {
  await requireUser();
  const { id } = await params;

  const user = await getUser(id);
  if (!user) notFound();

  const [sessions, t] = await Promise.all([listActiveUserSessions(id), getTranslations("users")]);

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/users" label={t("form.backToList")} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold break-words sm:text-2xl">
            {user.fullName}
            <UserStatusBadge isActive={user.isActive} />
          </h1>
          <p className="text-muted-foreground">
            {user.login} · {t(`roles.${user.role}`)}
          </p>
        </div>
        <UserCardActions
          user={{
            id: user.id,
            login: user.login,
            fullName: user.fullName,
            isActive: user.isActive,
          }}
        />
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">{t("card.tabs.profile")}</TabsTrigger>
          <TabsTrigger value="sessions">
            {t("card.tabs.sessions")}
            <Badge variant="secondary">{sessions.length}</Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <UserProfileDetails user={user} />
        </TabsContent>
        <TabsContent value="sessions">
          <UserSessions userId={user.id} sessions={sessions} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
