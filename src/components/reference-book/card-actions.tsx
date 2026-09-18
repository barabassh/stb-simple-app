"use client";

import { ArchiveIcon, ArchiveRestoreIcon, PencilIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";

import type { ReferenceSection } from "./list-params";
import {
  ReferenceStatusDialog,
  type ChangeReferenceStatus,
  type ReferenceActionTarget,
} from "./status-dialog";

type ReferenceCardActionsProps = {
  section: ReferenceSection;
  target: ReferenceActionTarget;
  changeStatus: ChangeReferenceStatus;
  viewer: Pick<SessionUser, "role">;
};

export function ReferenceCardActions({
  section,
  target,
  changeStatus,
  viewer,
}: ReferenceCardActionsProps) {
  const t = useTranslations("referenceBooks.actions");
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-wrap gap-2">
      {can(viewer, `${section}.update`) && (
        <Button variant="outline" asChild>
          <Link href={`/${section}/${target.id}/edit`}>
            <PencilIcon aria-hidden />
            {t("edit")}
          </Link>
        </Button>
      )}
      {can(viewer, `${section}.changeStatus`) &&
        (target.isActive ? (
          <Button variant="destructive" onClick={() => setConfirming(true)}>
            <ArchiveIcon aria-hidden />
            {t("archive")}
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setConfirming(true)}>
            <ArchiveRestoreIcon aria-hidden />
            {t("restore")}
          </Button>
        ))}

      <ReferenceStatusDialog
        section={section}
        target={target}
        changeStatus={changeStatus}
        open={confirming}
        onOpenChange={setConfirming}
      />
    </div>
  );
}
