"use client";

import { ArchiveIcon, ArchiveRestoreIcon, PencilIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";

import { CustomerStatusDialog, type CustomerActionTarget } from "./customer-status-dialog";

type CustomerCardActionsProps = {
  customer: CustomerActionTarget;
  viewer: Pick<SessionUser, "role">;
};

export function CustomerCardActions({ customer, viewer }: CustomerCardActionsProps) {
  const t = useTranslations("customers.actions");
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-wrap gap-2">
      {can(viewer, "customers.update") && (
        <Button variant="outline" asChild>
          <Link href={`/customers/${customer.id}/edit`}>
            <PencilIcon aria-hidden />
            {t("edit")}
          </Link>
        </Button>
      )}
      {can(viewer, "customers.changeStatus") &&
        (customer.isActive ? (
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

      <CustomerStatusDialog customer={customer} open={confirming} onOpenChange={setConfirming} />
    </div>
  );
}
