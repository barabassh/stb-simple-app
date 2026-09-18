"use client";

import { useTranslations } from "next-intl";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { useRunAction } from "@/components/use-run-action";
import type { Role } from "@/generated/prisma/enums";

import { toggleStatus } from "../actions";
import { ResetPasswordDialog } from "./reset-password-dialog";

export type UserActionTarget = {
  id: string;
  login: string;
  fullName: string;
  role: Role;
  isActive: boolean;
};

export type UserDialog = "deactivate" | "resetPassword" | null;

type UserActionDialogsProps = {
  user: UserActionTarget;
  dialog: UserDialog;
  onDialogChange: (dialog: UserDialog) => void;
};

/** Dialogs shared by the registry row menu and the user card. */
export function UserActionDialogs({ user, dialog, onDialogChange }: UserActionDialogsProps) {
  const t = useTranslations("users.dialogs");
  const { run, isPending } = useRunAction();

  const close = () => onDialogChange(null);

  return (
    <>
      <ConfirmDialog
        open={dialog === "deactivate"}
        onOpenChange={(open) => onDialogChange(open ? "deactivate" : null)}
        title={t("deactivate.title")}
        description={t("deactivate.description", { name: user.fullName })}
        confirmLabel={t("deactivate.confirm")}
        pending={isPending}
        onConfirm={() =>
          run(() => toggleStatus(user.id, false), "users.toasts.deactivated", {
            onSettled: close,
          })
        }
      />
      {dialog === "resetPassword" && <ResetPasswordDialog user={user} onClose={close} />}
    </>
  );
}
