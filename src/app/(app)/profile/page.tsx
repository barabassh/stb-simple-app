import { getTranslations } from "next-intl/server";

import { RecordStamps } from "@/features/audit/components/record-stamps";
import { OwnSessions } from "@/features/users/components/own-sessions";
import { ProfileForm } from "@/features/users/components/profile-form";
import { UserFieldList } from "@/features/users/components/user-field-list";
import { getOwnProfile, listOwnSessions } from "@/features/users/queries";
import { getCurrentSession, requirePagePermission } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";

export default async function ProfilePage() {
  const viewer = await requirePagePermission("profile.read");
  const [profile, sessions, current, t] = await Promise.all([
    getOwnProfile(viewer),
    can(viewer, "profile.sessions") ? listOwnSessions(viewer) : null,
    getCurrentSession(),
    getTranslations(),
  ]);
  const roleName = t(`users.roles.${profile.role}`);

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-xl font-semibold sm:text-2xl">{t("profile.title")}</h1>
        <p className="break-words text-muted-foreground">
          {profile.login} · {roleName}
        </p>
        <RecordStamps
          created={{ at: profile.createdAt, by: profile.createdBy }}
          updated={{ at: profile.updatedAt, by: profile.updatedBy }}
        />
      </div>

      <section aria-labelledby="profile-details-title" className="flex flex-col gap-3">
        <h2 id="profile-details-title" className="text-lg font-semibold">
          {t("profile.details")}
        </h2>
        {can(viewer, "profile.update") ? (
          <ProfileForm
            profile={{
              login: profile.login,
              role: profile.role,
              fullName: profile.fullName,
              position: profile.position,
              email: profile.email,
              phone: profile.phone,
            }}
          />
        ) : (
          <UserFieldList
            rows={[
              { key: "login", value: profile.login },
              { key: "fullName", value: profile.fullName },
              { key: "position", value: profile.position },
              { key: "email", value: profile.email },
              { key: "phone", value: profile.phone },
              { key: "role", value: roleName },
            ]}
          />
        )}
      </section>

      {sessions && <OwnSessions sessions={sessions} currentSessionId={current?.session.id} />}
    </div>
  );
}
