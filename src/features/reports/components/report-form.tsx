"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormProvider, useForm, useWatch, type Path, type Resolver } from "react-hook-form";
import { toast } from "sonner";

import {
  FormFooter,
  RecordField,
  SERVER_ERROR,
  TextareaField,
  TextField,
} from "@/components/reference-book/form-fields";
import type { RecordOption } from "@/components/reference-book/record-picker";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import type { ActionResult } from "@/lib/action-result";

import { createOwnReport, createReport, updateReport } from "../actions";
import { reportFormValues, workedMinutesOf, type ReportFormInput } from "../form-values";
import type { ReportForEdit } from "../queries";
import { ownReportSchema, workerReportSchema } from "../schemas";
import { formatHours } from "../time";

const REPORTS_PATH = "/reports";

type ReportFormProps = {
  /** The report being edited; omitted when filing one. */
  report?: ReportForEdit;
  /** The workers an administrator or a manager files a report for; omitted for one's own. */
  workers?: RecordOption[];
  /** The projects in progress. */
  projects: RecordOption[];
  /** `yyyy-MM-dd` in Europe/Kyiv, from the server, so that the page renders the same on both. */
  today: string;
  /** Chosen in advance, e.g. from the card of a project. */
  projectId?: string;
};

/**
 * The work report form (docs/ТЗ.md, 7.5), the main screen of a contractor on a phone: one column
 * below 768 px, the phone's own date and time pickers, the hours worked shown while typing.
 */
export function ReportForm({ report, workers, projects, today, projectId }: ReportFormProps) {
  const t = useTranslations();
  const router = useRouter();
  const forWorker = !report && workers !== undefined;
  const [overlapHref, setOverlapHref] = useState<string>();

  const form = useForm<ReportFormInput>({
    // Validates only: the action is sent the typed values and parses them again itself.
    resolver: (forWorker
      ? zodResolver(workerReportSchema)
      : zodResolver(ownReportSchema)) as unknown as Resolver<ReportFormInput>,
    defaultValues: reportFormValues(report ?? null, { today, projectId, forWorker }),
  });
  const { isDirty, isSubmitting, isSubmitSuccessful } = form.formState;

  function send(values: ReportFormInput): Promise<ActionResult> {
    if (report) return updateReport(report.id, values);
    return forWorker ? createReport(values) : createOwnReport(values);
  }

  /** Whether the report was saved; if not, the form shows why. */
  async function save(): Promise<boolean> {
    setOverlapHref(undefined);
    const result = await send(form.getValues());
    if (result.ok) {
      toast.success(t(report ? "reports.toasts.updated" : "reports.toasts.created"));
      return true;
    }

    for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
      if (messages?.[0]) {
        form.setError(field as Path<ReportFormInput>, {
          type: SERVER_ERROR,
          message: t(messages[0], result.errorValues),
        });
      }
    }
    if (result.error) {
      form.setError("root.server", { message: t(result.error, result.errorValues) });
    }
    const overlapping = result.errorValues?.reportId;
    if (typeof overlapping === "string") setOverlapHref(`${REPORTS_PATH}/${overlapping}`);
    return false;
  }

  async function saveBeforeLeaving(): Promise<boolean> {
    let saved = false;
    await form.handleSubmit(async () => {
      saved = await save();
    })();
    return saved;
  }

  return (
    <FormProvider {...form}>
      <UnsavedChangesGuard when={isDirty && !isSubmitSuccessful} onSave={saveBeforeLeaving} />
      <form
        onSubmit={form.handleSubmit(async () => {
          if (await save()) router.push(REPORTS_PATH);
        })}
        noValidate
      >
        <FieldGroup className="grid grid-cols-1 md:grid-cols-2">
          {forWorker && (
            <RecordField
              name="userId"
              label={t("reports.fields.worker")}
              options={workers}
              placeholder={t("reports.form.workerPlaceholder")}
              searchLabel={t("reports.form.workerSearch")}
              nothingFound={t("reports.form.workerNothingFound")}
              className="md:col-span-2"
            />
          )}
          {report && <FixedWorker report={report} />}

          <TextField name="workDate" label={t("reports.fields.workDate")} type="date" max={today} />
          <RecordField
            name="projectId"
            label={t("reports.fields.project")}
            options={projects}
            placeholder={t("reports.form.projectPlaceholder")}
            searchLabel={t("reports.form.projectSearch")}
            nothingFound={t("reports.form.projectNothingFound")}
          />
          <TextareaField
            name="workDescription"
            label={t("reports.fields.workDescription")}
            className="md:col-span-2"
          />
          <TextField
            name="startTime"
            label={t("reports.fields.startTime")}
            type="time"
            errorHref={overlapHref}
          />
          <TextField name="endTime" label={t("reports.fields.endTime")} type="time" />
          <TextField
            name="lunchMinutes"
            label={t("reports.fields.lunchMinutes")}
            inputMode="numeric"
          />
          <WorkedHours />
          <TextField name="mileageKm" label={t("reports.fields.mileageKm")} inputMode="numeric" />

          <FormFooter
            editing={!!report}
            cancelHref={REPORTS_PATH}
            disabled={isSubmitting || isSubmitSuccessful}
          />
        </FieldGroup>
      </form>
    </FormProvider>
  );
}

/** The worker of a saved report is not changed (docs/ТЗ.md, 7.5). */
function FixedWorker({ report }: { report: ReportForEdit }) {
  const t = useTranslations("reports");

  return (
    <Field className="md:col-span-2">
      <FieldTitle>{t("fields.worker")}</FieldTitle>
      <p className="break-words">
        {t("form.workerOption", {
          ...report.worker,
          organization: report.organization ?? t("form.ourCompany"),
        })}
      </p>
      <FieldDescription>{t("form.workerFixedHint")}</FieldDescription>
    </Field>
  );
}

/** Recalculated while the times are typed, by the function the rest of the application uses. */
function WorkedHours() {
  const t = useTranslations("reports");
  const [startTime, endTime, lunchMinutes] = useWatch<
    ReportFormInput,
    ["startTime", "endTime", "lunchMinutes"]
  >({ name: ["startTime", "endTime", "lunchMinutes"] });
  const minutes = workedMinutesOf({ startTime, endTime, lunchMinutes });

  return (
    <Field>
      <FieldLabel htmlFor="worked">{t("fields.worked")}</FieldLabel>
      <output
        id="worked"
        aria-live="polite"
        className="flex h-9 items-center rounded-md border border-dashed px-3 text-sm tabular-nums"
      >
        {minutes === null ? "—" : formatHours(minutes)}
      </output>
      <FieldDescription>{t("form.workedHint")}</FieldDescription>
    </Field>
  );
}
