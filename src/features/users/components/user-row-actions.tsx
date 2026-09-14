"use client";

import {
  EllipsisIcon,
  EyeIcon,
  KeyRoundIcon,
  LockIcon,
  LockOpenIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { toggleStatus } from "../actions";
import { UserActionDialogs, type UserActionTarget, type UserDialog } from "./user-action-dialogs";
import { useRunAction } from "./use-run-action";

export function UserRowActions({ user }: { user: UserActionTarget }) {
  const t = useTranslations("users");
  const [dialog, setDialog] = useState<UserDialog>(null);
  const { run, isPending } = useRunAction();

  return (
    <>
      {/* Non-modal: a modal menu closing while a dialog opens leaves the page without pointer events. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={isPending}
            aria-label={t("list.rowActions", { name: user.fullName })}
          >
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto">
          <DropdownMenuItem asChild>
            <Link href={`/users/${user.id}`}>
              <EyeIcon aria-hidden />
              {t("actions.open")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/users/${user.id}/edit`}>
              <PencilIcon aria-hidden />
              {t("actions.edit")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {user.isActive ? (
            <DropdownMenuItem onSelect={() => setDialog("block")}>
              <LockIcon aria-hidden />
              {t("actions.block")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={() => run(() => toggleStatus(user.id, true), "users.toasts.unblocked")}
            >
              <LockOpenIcon aria-hidden />
              {t("actions.unblock")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setDialog("resetPassword")}>
            <KeyRoundIcon aria-hidden />
            {t("actions.resetPassword")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
            <Trash2Icon aria-hidden />
            {t("actions.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <UserActionDialogs user={user} dialog={dialog} onDialogChange={setDialog} />
    </>
  );
}
