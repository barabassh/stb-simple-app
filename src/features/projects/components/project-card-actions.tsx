"use client";

import { LockIcon, LockOpenIcon, PencilIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { useRunAction } from "@/components/use-run-action";
import { Button } from "@/components/ui/button";
import type { ProjectStatus } from "@/generated/prisma/enums";
import type { SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";

import { changeProjectStatus, deleteProject } from "../actions";

type Confirmation = "close" | "reopen" | "delete";

type ProjectCardActionsProps = {
  project: { id: string; number: string; status: ProjectStatus };
  viewer: Pick<SessionUser, "role">;
};

/**
 * The buttons of the card by rights and status (docs/ТЗ.md, 6.7, 6.9): a closed project is only
 * brought back to work. Each change asks first, naming the project by its number.
 */
export function ProjectCardActions({ project, viewer }: ProjectCardActionsProps) {
  const t = useTranslations("projects");
  const router = useRouter();
  const { run, isPending } = useRunAction();
  const [confirming, setConfirming] = useState<Confirmation | null>(null);
  const inProgress = project.status === "IN_PROGRESS";

  const close = () => setConfirming(null);

  function confirm(action: Confirmation) {
    if (action === "delete") {
      run(() => deleteProject(project.id), "projects.toasts.deleted", {
        onSettled: close,
        // The card of a deleted project is not found any more.
        onSuccess: () => router.replace("/projects"),
      });
      return;
    }
    run(
      () => changeProjectStatus(project.id, action === "close" ? "CLOSED" : "IN_PROGRESS"),
      action === "close" ? "projects.toasts.closed" : "projects.toasts.reopened",
      { onSettled: close },
    );
  }

  const buttons = [
    can(viewer, "projects.update") && inProgress && (
      <Button key="edit" variant="outline" asChild>
        <Link href={`/projects/${project.id}/edit`}>
          <PencilIcon aria-hidden />
          {t("actions.edit")}
        </Link>
      </Button>
    ),
    can(viewer, "projects.changeStatus") && (
      <Button
        key="status"
        variant="outline"
        onClick={() => setConfirming(inProgress ? "close" : "reopen")}
      >
        {inProgress ? <LockIcon aria-hidden /> : <LockOpenIcon aria-hidden />}
        {t(inProgress ? "actions.close" : "actions.reopen")}
      </Button>
    ),
    can(viewer, "projects.delete") && inProgress && (
      <Button key="delete" variant="destructive" onClick={() => setConfirming("delete")}>
        <Trash2Icon aria-hidden />
        {t("actions.delete")}
      </Button>
    ),
  ].filter(Boolean);

  if (buttons.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {buttons}
      {confirming && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && close()}
          title={t(`dialogs.${confirming}.title`, { number: project.number })}
          description={t(`dialogs.${confirming}.description`)}
          confirmLabel={t(`dialogs.${confirming}.confirm`)}
          confirmVariant={confirming === "reopen" ? "default" : "destructive"}
          pending={isPending}
          onConfirm={() => confirm(confirming)}
        />
      )}
    </div>
  );
}
