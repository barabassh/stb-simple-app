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

import { CustomerStatusDialog, type CustomerActionTarget } from "./customer-status-dialog";

type CustomerRowActionsProps = {
  customer: CustomerActionTarget;
  viewer: Pick<SessionUser, "role">;
};

export function CustomerRowActions({ customer, viewer }: CustomerRowActionsProps) {
  const t = useTranslations("customers");
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      {/* Non-modal: a modal menu closing while a dialog opens leaves the page without pointer events. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("list.rowActions", { name: customer.name })}
          >
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto">
          <DropdownMenuItem asChild>
            <Link href={`/customers/${customer.id}`}>
              <EyeIcon aria-hidden />
              {t("actions.open")}
            </Link>
          </DropdownMenuItem>
          {can(viewer, "customers.update") && (
            <DropdownMenuItem asChild>
              <Link href={`/customers/${customer.id}/edit`}>
                <PencilIcon aria-hidden />
                {t("actions.edit")}
              </Link>
            </DropdownMenuItem>
          )}
          {can(viewer, "customers.changeStatus") && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant={customer.isActive ? "destructive" : "default"}
                onSelect={() => setConfirming(true)}
              >
                {customer.isActive ? (
                  <ArchiveIcon aria-hidden />
                ) : (
                  <ArchiveRestoreIcon aria-hidden />
                )}
                {t(customer.isActive ? "actions.archive" : "actions.restore")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <CustomerStatusDialog customer={customer} open={confirming} onOpenChange={setConfirming} />
    </>
  );
}
