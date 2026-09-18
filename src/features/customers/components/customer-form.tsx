"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { Controller, useForm, type Path } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import type { ActionFailure } from "@/lib/action-result";
import { countryOptions } from "@/lib/nl/countries";

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
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const countries = useMemo(() => countryOptions(locale), [locale]);

  const form = useForm<CustomerFormInput, unknown, CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: customerFormValues(customer ?? null),
  });
  const { errors, isDirty, isSubmitting, isSubmitSuccessful } = form.formState;
  // The fields a private customer does not have are hidden and dropped by the schema.
  const isCompany = form.watch("type") === "COMPANY";

  function showFailure(failure: ActionFailure) {
    for (const [field, messages] of Object.entries(failure.fieldErrors ?? {})) {
      if (messages?.[0]) {
        form.setError(field as Path<CustomerFormInput>, { message: messages[0] });
      }
    }
    if (failure.error) {
      form.setError("root.server", { message: t(failure.error, failure.errorValues) });
    }
  }

  /** The id of the saved customer, or null when the save failed and the form shows why. */
  async function save(values: CustomerFormValues): Promise<string | null> {
    const result = customer
      ? { ...(await updateCustomer(customer.id, values)), id: customer.id }
      : await createCustomer(values);
    if (!result.ok) {
      showFailure(result);
      return null;
    }
    toast.success(t(customer ? "customers.toasts.updated" : "customers.toasts.created"));
    return result.id;
  }

  async function onSubmit(values: CustomerFormValues) {
    const id = await save(values);
    if (id) router.push(`/customers/${id}`);
  }

  async function saveBeforeLeaving(): Promise<boolean> {
    let saved = false;
    await form.handleSubmit(async (values) => {
      saved = (await save(values)) !== null;
    })();
    return saved;
  }

  const fieldError = (message: string | undefined) => message && t(message);
  const addressError = (field: keyof CustomerFormInput["address"]) =>
    fieldError(errors.address?.[field]?.message);

  return (
    <>
      <UnsavedChangesGuard when={isDirty && !isSubmitSuccessful} onSave={saveBeforeLeaving} />
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup className="grid md:grid-cols-2">
          <Field data-invalid={!!errors.type}>
            <FieldLabel htmlFor="type">{t("customers.fields.type")}</FieldLabel>
            <Controller
              control={form.control}
              name="type"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="type"
                    ref={field.ref}
                    onBlur={field.onBlur}
                    aria-invalid={!!errors.type}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CUSTOMER_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {t(`customers.types.${type}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError>{fieldError(errors.type?.message)}</FieldError>
          </Field>

          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="name">
              {t(isCompany ? "customers.fields.name" : "customers.fields.personName")}
            </FieldLabel>
            <Input
              id="name"
              autoComplete="off"
              aria-invalid={!!errors.name}
              {...form.register("name")}
            />
            <FieldError>{fieldError(errors.name?.message)}</FieldError>
          </Field>

          {isCompany && (
            <>
              <Field data-invalid={!!errors.kvkNumber}>
                <FieldLabel htmlFor="kvkNumber">{t("customers.fields.kvkNumber")}</FieldLabel>
                <Input
                  id="kvkNumber"
                  inputMode="numeric"
                  autoComplete="off"
                  aria-invalid={!!errors.kvkNumber}
                  {...form.register("kvkNumber")}
                />
                <FieldError>{fieldError(errors.kvkNumber?.message)}</FieldError>
              </Field>

              <Field data-invalid={!!errors.vatId}>
                <FieldLabel htmlFor="vatId">{t("customers.fields.vatId")}</FieldLabel>
                <Input
                  id="vatId"
                  autoComplete="off"
                  autoCapitalize="characters"
                  aria-invalid={!!errors.vatId}
                  {...form.register("vatId")}
                />
                <FieldError>{fieldError(errors.vatId?.message)}</FieldError>
              </Field>

              <Field data-invalid={!!errors.contactPerson}>
                <FieldLabel htmlFor="contactPerson">
                  {t("customers.fields.contactPerson")}
                </FieldLabel>
                <Input
                  id="contactPerson"
                  autoComplete="off"
                  aria-invalid={!!errors.contactPerson}
                  {...form.register("contactPerson")}
                />
                <FieldError>{fieldError(errors.contactPerson?.message)}</FieldError>
              </Field>
            </>
          )}

          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="email">{t("customers.fields.email")}</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={!!errors.email}
              {...form.register("email")}
            />
            <FieldError>{fieldError(errors.email?.message)}</FieldError>
          </Field>

          <Field data-invalid={!!errors.phone}>
            <FieldLabel htmlFor="phone">{t("customers.fields.phone")}</FieldLabel>
            <Input
              id="phone"
              type="tel"
              autoComplete="off"
              aria-invalid={!!errors.phone}
              {...form.register("phone")}
            />
            <FieldError>{fieldError(errors.phone?.message)}</FieldError>
          </Field>

          <div className="flex flex-col gap-2 md:col-span-2">
            <Separator />
            <h2 className="text-base font-semibold">{t("address.title")}</h2>
            <FieldDescription>{t("customers.form.addressHint")}</FieldDescription>
          </div>

          <Field data-invalid={!!errors.address?.street} className="md:col-span-2">
            <FieldLabel htmlFor="address.street">{t("address.street")}</FieldLabel>
            <Input
              id="address.street"
              autoComplete="off"
              aria-invalid={!!errors.address?.street}
              {...form.register("address.street")}
            />
            <FieldError>{addressError("street")}</FieldError>
          </Field>

          <Field data-invalid={!!errors.address?.houseNumber}>
            <FieldLabel htmlFor="address.houseNumber">{t("address.houseNumber")}</FieldLabel>
            <Input
              id="address.houseNumber"
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={!!errors.address?.houseNumber}
              {...form.register("address.houseNumber")}
            />
            <FieldError>{addressError("houseNumber")}</FieldError>
          </Field>

          <Field data-invalid={!!errors.address?.houseNumberAddition}>
            <FieldLabel htmlFor="address.houseNumberAddition">
              {t("address.houseNumberAddition")}
            </FieldLabel>
            <Input
              id="address.houseNumberAddition"
              autoComplete="off"
              aria-invalid={!!errors.address?.houseNumberAddition}
              {...form.register("address.houseNumberAddition")}
            />
            <FieldError>{addressError("houseNumberAddition")}</FieldError>
          </Field>

          <Field data-invalid={!!errors.address?.postcode}>
            <FieldLabel htmlFor="address.postcode">{t("address.postcode")}</FieldLabel>
            <Input
              id="address.postcode"
              autoComplete="off"
              autoCapitalize="characters"
              aria-invalid={!!errors.address?.postcode}
              {...form.register("address.postcode")}
            />
            <FieldError>{addressError("postcode")}</FieldError>
          </Field>

          <Field data-invalid={!!errors.address?.city}>
            <FieldLabel htmlFor="address.city">{t("address.city")}</FieldLabel>
            <Input
              id="address.city"
              autoComplete="off"
              aria-invalid={!!errors.address?.city}
              {...form.register("address.city")}
            />
            <FieldError>{addressError("city")}</FieldError>
          </Field>

          <Field data-invalid={!!errors.address?.country}>
            <FieldLabel htmlFor="address.country">{t("address.country")}</FieldLabel>
            <Controller
              control={form.control}
              name="address.country"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="address.country"
                    ref={field.ref}
                    onBlur={field.onBlur}
                    aria-invalid={!!errors.address?.country}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {countries.map(({ code, name }) => (
                      <SelectItem key={code} value={code}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError>{addressError("country")}</FieldError>
          </Field>

          <Field data-invalid={!!errors.comment} className="md:col-span-2">
            <FieldLabel htmlFor="comment">{t("customers.fields.comment")}</FieldLabel>
            <Textarea
              id="comment"
              rows={3}
              aria-invalid={!!errors.comment}
              {...form.register("comment")}
            />
            <FieldError>{fieldError(errors.comment?.message)}</FieldError>
          </Field>

          {errors.root?.server && (
            <FieldError className="md:col-span-2">{errors.root.server.message}</FieldError>
          )}

          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button type="submit" disabled={isSubmitting || isSubmitSuccessful}>
              {t(customer ? "customers.form.save" : "customers.form.create")}
            </Button>
            <Button variant="outline" asChild>
              <Link href={customer ? `/customers/${customer.id}` : "/customers"}>
                {t("customers.form.cancel")}
              </Link>
            </Button>
          </div>
        </FieldGroup>
      </form>
    </>
  );
}
