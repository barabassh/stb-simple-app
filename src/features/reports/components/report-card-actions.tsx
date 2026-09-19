"use client";

import { CheckIcon, PencilIcon, UndoIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useRunAction } from "@/components/use-run-action";

import { approveReport, unapproveReport } from "../actions";
import type { AvailableReportActions } from "../report-actions";
import { unapproveReportSchema } from "../schemas";
import { ReportDeleteButton } from "./report-delete-button";

type ReportCardActionsProps = {
  report: { id: string; projectNumber: string };
  /** dd.MM.yyyy. */
  date: string;
  /** From availableReportActions() on the server. */
  actions: AvailableReportActions;
};

/** The buttons of the card by rights, the report's status and the project's (docs/ТЗ.md, 7.10). */
export function ReportCardActions({ report, date, actions }: ReportCardActionsProps) {
  const t = useTranslations("reports.actions");
  const { run, isPending } = useRunAction();
  const [unapproving, setUnapproving] = useState(false);

  if (!Object.values(actions).some(Boolean)) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {actions.approve && (
        <Button
          disabled={isPending}
          onClick={() => run(() => approveReport(report.id), "reports.toasts.approved")}
        >
          <CheckIcon aria-hidden />
          {t("approve")}
        </Button>
      )}
      {actions.unapprove && (
        <Button variant="outline" onClick={() => setUnapproving(true)}>
          <UndoIcon aria-hidden />
          {t("unapprove")}
        </Button>
      )}
      {actions.edit && (
        <Button variant="outline" asChild>
          <Link href={`/reports/${report.id}/edit`}>
            <PencilIcon aria-hidden />
            {t("edit")}
          </Link>
        </Button>
      )}
      {actions.delete && (
        <ReportDeleteButton reportId={report.id} date={date} projectNumber={report.projectNumber} />
      )}
      {unapproving && (
        <UnapproveDialog
          reportId={report.id}
          title={t("unapproveTitle", { date, number: report.projectNumber })}
          onClose={() => setUnapproving(false)}
        />
      )}
    </div>
  );
}

/** The reason is required: the worker sees it on the card and in the registry (docs/ТЗ.md, 7.7). */
function UnapproveDialog({
  reportId,
  title,
  onClose,
}: {
  reportId: string;
  title: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = unapproveReportSchema.safeParse({ reason });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "errors.invalidRequest");
      return;
    }
    startTransition(async () => {
      const result = await unapproveReport(reportId, { reason });
      if (result.ok) {
        toast.success(t("reports.toasts.unapproved"));
        onClose();
      } else if (result.fieldErrors?.reason?.[0]) {
        setError(result.fieldErrors.reason[0]);
      } else {
        toast.error(t(result.error ?? "errors.invalidRequest", result.errorValues));
        onClose();
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !isPending && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{t("reports.actions.unapproveDescription")}</DialogDescription>
          </DialogHeader>
          <Field data-invalid={error !== null}>
            <FieldLabel htmlFor={reasonId}>{t("reports.actions.reason")}</FieldLabel>
            <Textarea
              id={reasonId}
              value={reason}
              maxLength={500}
              rows={4}
              aria-invalid={error !== null}
              onChange={(event) => {
                setReason(event.target.value);
                setError(null);
              }}
            />
            {error && <FieldError>{t(error)}</FieldError>}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {t("reports.actions.unapprove")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
