"use client";

import { Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useRunAction } from "@/components/use-run-action";

import { deleteReport } from "../actions";

type ReportDeleteButtonProps = {
  reportId: string;
  /** dd.MM.yyyy. */
  date: string;
  projectNumber: string;
};

/** Asks first, naming the report by its date and project (docs/ТЗ.md, 7.7). */
export function ReportDeleteButton({ reportId, date, projectNumber }: ReportDeleteButtonProps) {
  const t = useTranslations("reports.actions");
  const router = useRouter();
  const { run, isPending } = useRunAction();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Button variant="destructive" onClick={() => setConfirming(true)}>
        <Trash2Icon aria-hidden />
        {t("delete")}
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("deleteTitle", { date, number: projectNumber })}
        description={t("deleteDescription")}
        confirmLabel={t("delete")}
        pending={isPending}
        onConfirm={() =>
          run(() => deleteReport(reportId), "reports.toasts.deleted", {
            onSettled: () => setConfirming(false),
            onSuccess: () => router.replace("/reports"),
          })
        }
      />
    </>
  );
}
