"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm, useWatch } from "react-hook-form";

import {
  AddressFields,
  RecordField,
  SelectField,
  TextareaField,
  TextField,
} from "@/components/reference-book/form-fields";
import type { RecordOption } from "@/components/reference-book/record-picker";
import { ReferenceForm } from "@/components/reference-book/reference-form";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { VatRate } from "@/generated/prisma/enums";
import { formatMoney } from "@/lib/format";

import { createProject, updateProject } from "../actions";
import { budgetWithVat, parseDecimalInput } from "../budget";
import { projectFormValues } from "../form-values";
import type { ProjectForEdit } from "../queries";
import {
  AMOUNT_WHOLE_DIGITS,
  projectFormSchema,
  type ProjectFormInput,
  type ProjectFormValues,
} from "../schemas";

const VAT_RATES = Object.values(VatRate);

type ProjectFormProps = {
  /** The project being edited; omitted when creating one. */
  project?: ProjectForEdit;
  /** The number a new project is offered. */
  suggestedNumber?: string;
  /** The active customers, plus the project's own one when it has since been archived. */
  customers: RecordOption[];
};

export function ProjectForm({ project, suggestedNumber, customers }: ProjectFormProps) {
  const t = useTranslations("projects");

  const form = useForm<ProjectFormInput, unknown, ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: projectFormValues(project ?? null, suggestedNumber),
  });

  return (
    <ReferenceForm
      section="projects"
      form={form}
      recordId={project?.id}
      save={async (values) =>
        project
          ? { ...(await updateProject(project.id, values)), id: project.id }
          : createProject(values)
      }
    >
      <TextField
        name="number"
        label={t("fields.number")}
        description={project ? undefined : t("form.numberHint")}
        autoCapitalize="characters"
        spellCheck={false}
      />
      <TextField name="name" label={t("fields.name")} />
      <RecordField
        name="customerId"
        label={t("fields.customer")}
        options={customers}
        placeholder={t("form.customerPlaceholder")}
        searchLabel={t("form.customerSearch")}
        nothingFound={t("form.customerNothingFound")}
      />
      <TextField name="startDate" label={t("fields.startDate")} type="date" />
      <TextareaField name="description" label={t("fields.description")} className="md:col-span-2" />

      <AddressFields title={t("form.siteAddressTitle")} hint={t("form.siteAddressHint")} />

      <div className="flex flex-col gap-2 md:col-span-2">
        <Separator />
        <h2 className="text-base font-semibold">{t("form.budgetTitle")}</h2>
      </div>
      <TextField name="budgetAmount" label={t("fields.budgetAmount")} inputMode="decimal" />
      <SelectField
        name="vatRate"
        label={t("fields.vatRate")}
        options={VAT_RATES.map((rate) => ({ value: rate, label: t(`vatRates.${rate}`) }))}
      />
      <BudgetWithVat />
      <TextField name="budgetHours" label={t("fields.budgetHours")} inputMode="decimal" />
    </ReferenceForm>
  );
}

/** Recalculated while the amount is typed (docs/ТЗ.md, 6.6), by the function the server uses. */
function BudgetWithVat() {
  const t = useTranslations("projects");
  const [amountInput, vatRate] = useWatch<ProjectFormInput, ["budgetAmount", "vatRate"]>({
    name: ["budgetAmount", "vatRate"],
  });

  const amount = parseDecimalInput(amountInput.trim(), AMOUNT_WHOLE_DIGITS);
  const total = amount !== null && vatRate ? formatMoney(budgetWithVat(amount, vatRate)) : "—";

  return (
    <Field>
      <FieldLabel htmlFor="budgetWithVat">{t("fields.budgetWithVat")}</FieldLabel>
      <output
        id="budgetWithVat"
        aria-live="polite"
        className="flex h-9 items-center rounded-md border border-dashed px-3 text-sm tabular-nums"
      >
        {amountInput.trim() === "" ? "—" : total}
      </output>
      <FieldDescription>{t("form.budgetWithVatHint")}</FieldDescription>
    </Field>
  );
}
