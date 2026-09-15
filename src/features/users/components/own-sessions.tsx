import { useTranslations } from "next-intl";

import type { UserSessionItem } from "../queries";
import { SessionTable } from "./session-table";
import { RevokeOtherOwnSessionsButton, RevokeOwnSessionButton } from "./user-session-actions";

type OwnSessionsProps = {
  sessions: UserSessionItem[];
  currentSessionId?: string;
};

export function OwnSessions({ sessions, currentSessionId }: OwnSessionsProps) {
  const t = useTranslations("profile");
  const hasOtherSessions = sessions.some(({ id }) => id !== currentSessionId);

  return (
    <section aria-labelledby="own-sessions-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="own-sessions-title" className="text-lg font-semibold">
          {t("sessions")}
        </h2>
        {hasOtherSessions && <RevokeOtherOwnSessionsButton />}
      </div>
      <SessionTable
        sessions={sessions}
        currentSessionId={currentSessionId}
        // The current session is ended with the sign-out button in the header.
        renderActions={(session) =>
          session.id !== currentSessionId && <RevokeOwnSessionButton sessionId={session.id} />
        }
      />
    </section>
  );
}
