"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";

import {
  AddressFields,
  SelectField,
  TextareaField,
  TextField,
} from "@/components/reference-book/form-fields";
import { ReferenceForm } from "@/components/reference-book/reference-form";
import { LegalForm } from "@/generated/prisma/enums";

import { createContractor, updateContractor } from "../actions";
import { contractorFormValues } from "../form-values";
import type { ContractorDetails } from "../queries";
import {
  contractorFormSchema,
  type ContractorFormInput,
  type ContractorFormValues,
} from "../schemas";

type ContractorFormProps = {
  /** The contractor being edited; omitted when creating one. */
  contractor?: ContractorDetails;
};

export function ContractorForm({ contractor }: ContractorFormProps) {
  const t = useTranslations();

  const form = useForm<ContractorFormInput, unknown, ContractorFormValues>({
    resolver: zodResolver(contractorFormSchema),
    defaultValues: contractorFormValues(contractor ?? null),
  });

  return (
    <ReferenceForm
      section="contractors"
      form={form}
      recordId={contractor?.id}
      save={async (values) =>
        contractor
          ? { ...(await updateContractor(contractor.id, values)), id: contractor.id }
          : createContractor(values)
      }
    >
      <TextField name="name" label={t("contractors.fields.name")} />
      <SelectField
        name="legalForm"
        label={t("contractors.fields.legalForm")}
        options={Object.values(LegalForm).map((value) => ({
          value,
          label: t(`settings.company.legalForms.${value}`),
        }))}
        clearable
      />
      <TextField name="kvkNumber" label={t("contractors.fields.kvkNumber")} inputMode="numeric" />
      <TextField name="vatId" label={t("contractors.fields.vatId")} autoCapitalize="characters" />
      <TextField name="contactPerson" label={t("contractors.fields.contactPerson")} />
      <TextField
        name="email"
        label={t("contractors.fields.email")}
        type="email"
        autoCapitalize="none"
        spellCheck={false}
      />
      <TextField name="phone" label={t("contractors.fields.phone")} type="tel" />

      <AddressFields />

      <TextareaField
        name="comment"
        label={t("contractors.fields.comment")}
        className="md:col-span-2"
      />
    </ReferenceForm>
  );
}
