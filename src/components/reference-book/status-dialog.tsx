"use client";

import { useTranslations } from "next-intl";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { useRunAction } from "@/components/use-run-action";
import type { ActionResult } from "@/lib/action-result";

import type { ReferenceSection } from "./list-params";

export type ReferenceActionTarget = { id: string; name: string; isActive: boolean };

/** Moves a record to the archive (`isActive: false`) or brings it back. */
export type ChangeReferenceStatus = (id: string, isActive: boolean) => Promise<ActionResult>;

/** The archive and restore confirmations, shared by the registry row menu and the card. */
export function ReferenceStatusDialog({
  section,
  target,
  changeStatus,
  open,
  onOpenChange,
}: {
  section: ReferenceSection;
  target: ReferenceActionTarget;
  changeStatus: ChangeReferenceStatus;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations(section);
  const { run, isPending } = useRunAction();
  const action = target.isActive ? "archive" : "restore";

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(`dialogs.${action}.title`)}
      description={t(`dialogs.${action}.description`, { name: target.name })}
      confirmLabel={t(`dialogs.${action}.confirm`)}
      confirmVariant={target.isActive ? "destructive" : "default"}
      pending={isPending}
      onConfirm={() =>
        run(
          () => changeStatus(target.id, !target.isActive),
          `${section}.toasts.${target.isActive ? "archived" : "restored"}`,
          { onSettled: () => onOpenChange(false) },
        )
      }
    />
  );
}
