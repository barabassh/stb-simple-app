"use client";

import { useTranslations } from "next-intl";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { useRunAction } from "@/components/use-run-action";

import { changeCustomerStatus } from "../actions";

export type CustomerActionTarget = { id: string; name: string; isActive: boolean };

/** The archive and restore confirmations, shared by the registry row menu and the customer card. */
export function CustomerStatusDialog({
  customer,
  open,
  onOpenChange,
}: {
  customer: CustomerActionTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("customers.dialogs");
  const { run, isPending } = useRunAction();
  const action = customer.isActive ? "archive" : "restore";

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(`${action}.title`)}
      description={t(`${action}.description`, { name: customer.name })}
      confirmLabel={t(`${action}.confirm`)}
      confirmVariant={customer.isActive ? "destructive" : "default"}
      pending={isPending}
      onConfirm={() =>
        run(
          () => changeCustomerStatus(customer.id, !customer.isActive),
          `customers.toasts.${customer.isActive ? "archived" : "restored"}`,
          { onSettled: () => onOpenChange(false) },
        )
      }
    />
  );
}
