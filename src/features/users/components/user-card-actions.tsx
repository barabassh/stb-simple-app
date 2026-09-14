"use client";

import { KeyRoundIcon, LockIcon, LockOpenIcon, PencilIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { toggleStatus } from "../actions";
import { UserActionDialogs, type UserActionTarget, type UserDialog } from "./user-action-dialogs";
import { useRunAction } from "./use-run-action";

export function UserCardActions({ user }: { user: UserActionTarget }) {
  const t = useTranslations("users.actions");
  const router = useRouter();
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
      {user.isActive ? (
        <Button variant="outline" onClick={() => setDialog("block")}>
          <LockIcon aria-hidden />
          {t("block")}
        </Button>
      ) : (
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() => run(() => toggleStatus(user.id, true), "users.toasts.unblocked")}
        >
          <LockOpenIcon aria-hidden />
          {t("unblock")}
        </Button>
      )}
      <Button variant="outline" onClick={() => setDialog("resetPassword")}>
        <KeyRoundIcon aria-hidden />
        {t("resetPassword")}
      </Button>
      <Button variant="destructive" onClick={() => setDialog("delete")}>
        <Trash2Icon aria-hidden />
        {t("delete")}
      </Button>

      <UserActionDialogs
        user={user}
        dialog={dialog}
        onDialogChange={setDialog}
        onDeleted={() => router.replace("/users")}
      />
    </div>
  );
}
