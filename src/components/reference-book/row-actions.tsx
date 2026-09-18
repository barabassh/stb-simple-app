"use client";

import { ArchiveIcon, ArchiveRestoreIcon, EllipsisIcon, EyeIcon, PencilIcon } from "lucide-react";
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
import type { SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";

import type { ReferenceSection } from "./list-params";
import {
  ReferenceStatusDialog,
  type ChangeReferenceStatus,
  type ReferenceActionTarget,
} from "./status-dialog";

type ReferenceRowActionsProps = {
  section: ReferenceSection;
  target: ReferenceActionTarget;
  changeStatus: ChangeReferenceStatus;
  viewer: Pick<SessionUser, "role">;
};

export function ReferenceRowActions({
  section,
  target,
  changeStatus,
  viewer,
}: ReferenceRowActionsProps) {
  const t = useTranslations("referenceBooks");
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      {/* Non-modal: a modal menu closing while a dialog opens leaves the page without pointer events. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("list.rowActions", { name: target.name })}
          >
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto">
          <DropdownMenuItem asChild>
            <Link href={`/${section}/${target.id}`}>
              <EyeIcon aria-hidden />
              {t("actions.open")}
            </Link>
          </DropdownMenuItem>
          {can(viewer, `${section}.update`) && (
            <DropdownMenuItem asChild>
              <Link href={`/${section}/${target.id}/edit`}>
                <PencilIcon aria-hidden />
                {t("actions.edit")}
              </Link>
            </DropdownMenuItem>
          )}
          {can(viewer, `${section}.changeStatus`) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant={target.isActive ? "destructive" : "default"}
                onSelect={() => setConfirming(true)}
              >
                {target.isActive ? <ArchiveIcon aria-hidden /> : <ArchiveRestoreIcon aria-hidden />}
                {t(target.isActive ? "actions.archive" : "actions.restore")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ReferenceStatusDialog
        section={section}
        target={target}
        changeStatus={changeStatus}
        open={confirming}
        onOpenChange={setConfirming}
      />
    </>
  );
}
