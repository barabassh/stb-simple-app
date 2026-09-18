"use client";

import { LogOutIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { useRunAction } from "@/components/use-run-action";

import {
  revokeAllUserSessions,
  revokeOtherOwnSessions,
  revokeOwnSession,
  revokeUserSession,
} from "../actions";

export function RevokeSessionButton({ userId, sessionId }: { userId: string; sessionId: string }) {
  const t = useTranslations("users.sessions");
  const { run, isPending } = useRunAction();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => run(() => revokeUserSession(userId, sessionId), "users.toasts.sessionRevoked")}
    >
      <LogOutIcon aria-hidden />
      {t("revoke")}
    </Button>
  );
}

export function RevokeAllSessionsButton({ userId }: { userId: string }) {
  const t = useTranslations("users.sessions");
  const { run, isPending } = useRunAction();

  return (
    <Button
      variant="outline"
      disabled={isPending}
      onClick={() => run(() => revokeAllUserSessions(userId), "users.toasts.allSessionsRevoked")}
    >
      <LogOutIcon aria-hidden />
      {t("revokeAll")}
    </Button>
  );
}

export function RevokeOwnSessionButton({ sessionId }: { sessionId: string }) {
  const t = useTranslations("users.sessions");
  const { run, isPending } = useRunAction();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => run(() => revokeOwnSession(sessionId), "users.toasts.sessionRevoked")}
    >
      <LogOutIcon aria-hidden />
      {t("revoke")}
    </Button>
  );
}

export function RevokeOtherOwnSessionsButton() {
  const t = useTranslations("users.sessions");
  const { run, isPending } = useRunAction();

  return (
    <Button
      variant="outline"
      disabled={isPending}
      onClick={() => run(() => revokeOtherOwnSessions(), "users.toasts.otherSessionsRevoked")}
    >
      <LogOutIcon aria-hidden />
      {t("revokeOthers")}
    </Button>
  );
}
