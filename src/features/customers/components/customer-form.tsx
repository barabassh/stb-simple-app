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

import { createCustomer, updateCustomer } from "../actions";
import { customerFormValues } from "../form-values";
import { CUSTOMER_TYPES } from "../list-params";
import type { CustomerDetails } from "../queries";
import { customerFormSchema, type CustomerFormInput, type CustomerFormValues } from "../schemas";

type CustomerFormProps = {
  /** The customer being edited; omitted when creating one. */
  customer?: CustomerDetails;
};

export function CustomerForm({ customer }: CustomerFormProps) {
  const t = useTranslations("customers");

  const form = useForm<CustomerFormInput, unknown, CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: customerFormValues(customer ?? null),
  });
  // The fields a private customer does not have are hidden and dropped by the schema.
  const isCompany = form.watch("type") === "COMPANY";

  return (
    <ReferenceForm
      section="customers"
      form={form}
      recordId={customer?.id}
      save={async (values) =>
        customer
          ? { ...(await updateCustomer(customer.id, values)), id: customer.id }
          : createCustomer(values)
      }
    >
      <SelectField
        name="type"
        label={t("fields.type")}
        options={CUSTOMER_TYPES.map((type) => ({ value: type, label: t(`types.${type}`) }))}
      />
      <TextField name="name" label={t(isCompany ? "fields.name" : "fields.personName")} />

      {isCompany && (
        <>
          <TextField name="kvkNumber" label={t("fields.kvkNumber")} inputMode="numeric" />
          <TextField name="vatId" label={t("fields.vatId")} autoCapitalize="characters" />
          <TextField name="contactPerson" label={t("fields.contactPerson")} />
        </>
      )}

      <TextField
        name="email"
        label={t("fields.email")}
        type="email"
        autoCapitalize="none"
        spellCheck={false}
      />
      <TextField name="phone" label={t("fields.phone")} type="tel" />

      <AddressFields />

      <TextareaField name="comment" label={t("fields.comment")} className="md:col-span-2" />
    </ReferenceForm>
  );
}
