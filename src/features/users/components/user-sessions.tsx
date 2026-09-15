import type { SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";

import type { UserSessionItem } from "../queries";
import { SessionTable } from "./session-table";
import { RevokeAllSessionsButton, RevokeSessionButton } from "./user-session-actions";

type UserSessionsProps = {
  userId: string;
  sessions: UserSessionItem[];
  viewer: Pick<SessionUser, "role">;
};

export function UserSessions({ userId, sessions, viewer }: UserSessionsProps) {
  const canRevoke = can(viewer, "users.sessions.revoke");

  return (
    <div className="flex flex-col gap-3">
      {canRevoke && sessions.length > 0 && (
        <div className="flex justify-end">
          <RevokeAllSessionsButton userId={userId} />
        </div>
      )}
      <SessionTable
        sessions={sessions}
        renderActions={
          canRevoke
            ? (session) => <RevokeSessionButton userId={userId} sessionId={session.id} />
            : undefined
        }
      />
    </div>
  );
}
