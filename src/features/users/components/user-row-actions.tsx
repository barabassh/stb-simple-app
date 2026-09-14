"use client";

import {
  EllipsisIcon,
  EyeIcon,
  KeyRoundIcon,
  PencilIcon,
  UserCheckIcon,
  UserXIcon,
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
          <DropdownMenuItem onSelect={() => setDialog("resetPassword")}>
            <KeyRoundIcon aria-hidden />
            {t("actions.resetPassword")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {user.isActive ? (
            <DropdownMenuItem variant="destructive" onSelect={() => setDialog("deactivate")}>
              <UserXIcon aria-hidden />
              {t("actions.deactivate")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={() => run(() => toggleStatus(user.id, true), "users.toasts.activated")}
            >
              <UserCheckIcon aria-hidden />
              {t("actions.activate")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <UserActionDialogs user={user} dialog={dialog} onDialogChange={setDialog} />
    </>
  );
}
