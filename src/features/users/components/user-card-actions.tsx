"use client";

import { KeyRoundIcon, PencilIcon, UserCheckIcon, UserXIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { toggleStatus } from "../actions";
import { UserActionDialogs, type UserActionTarget, type UserDialog } from "./user-action-dialogs";
import { useRunAction } from "./use-run-action";

export function UserCardActions({ user }: { user: UserActionTarget }) {
  const t = useTranslations("users.actions");
  const [dialog, setDialog] = useState<UserDialog>(null);
  const { run, isPending } = useRunAction();

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" asChild>
        <Link href={`/users/${user.id}/edit`}>
          <PencilIcon aria-hidden />
          {t("edit")}
        </Link>
      </Button>
      <Button variant="outline" onClick={() => setDialog("resetPassword")}>
        <KeyRoundIcon aria-hidden />
        {t("resetPassword")}
      </Button>
      {user.isActive ? (
        <Button variant="destructive" onClick={() => setDialog("deactivate")}>
          <UserXIcon aria-hidden />
          {t("deactivate")}
        </Button>
      ) : (
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() => run(() => toggleStatus(user.id, true), "users.toasts.activated")}
        >
          <UserCheckIcon aria-hidden />
          {t("activate")}
        </Button>
      )}

      <UserActionDialogs user={user} dialog={dialog} onDialogChange={setDialog} />
    </div>
  );
}
