"use client";

import { useTranslations } from "next-intl";

import { deleteUser, toggleStatus } from "../actions";
import { ConfirmDialog } from "./confirm-dialog";
import { ResetPasswordDialog } from "./reset-password-dialog";
import { useRunAction } from "./use-run-action";

export type UserActionTarget = {
  id: string;
  login: string;
  fullName: string;
  isActive: boolean;
};

export type UserDialog = "block" | "delete" | "resetPassword" | null;

type UserActionDialogsProps = {
  user: UserActionTarget;
  dialog: UserDialog;
  onDialogChange: (dialog: UserDialog) => void;
  onDeleted?: () => void;
};

/** Dialogs shared by the registry row menu and the user card. */
export function UserActionDialogs({
  user,
  dialog,
  onDialogChange,
  onDeleted,
}: UserActionDialogsProps) {
  const t = useTranslations("users.dialogs");
  const { run, isPending } = useRunAction();

  const close = () => onDialogChange(null);
  const toggle = (name: Exclude<UserDialog, null>) => (open: boolean) =>
    onDialogChange(open ? name : null);

  return (
    <>
      <ConfirmDialog
        open={dialog === "block"}
        onOpenChange={toggle("block")}
        title={t("block.title")}
        description={t("block.description", { name: user.fullName })}
        confirmLabel={t("block.confirm")}
        pending={isPending}
        onConfirm={() =>
          run(() => toggleStatus(user.id, false), "users.toasts.blocked", { onSettled: close })
        }
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={toggle("delete")}
        title={t("delete.title")}
        description={t("delete.description", { name: user.fullName })}
        confirmLabel={t("delete.confirm")}
        pending={isPending}
        onConfirm={() =>
          run(() => deleteUser(user.id), "users.toasts.deleted", {
            onSuccess: onDeleted,
            onSettled: close,
          })
        }
      />
      {dialog === "resetPassword" && <ResetPasswordDialog user={user} onClose={close} />}
    </>
  );
}
