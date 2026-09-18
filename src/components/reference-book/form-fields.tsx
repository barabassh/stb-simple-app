"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { Controller, get, useFormContext, useFormState } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
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
import { countryOptions } from "@/lib/nl/countries";

// The fields of the customer and contractor forms (docs/ТЗ.md, 6.4–6.5), read from the form
// context: the forms differ in a few fields, not in how a field looks or reports its error.

/** The message key of the field's error, translated. */
function useFieldError(name: string): string | undefined {
  const t = useTranslations();
  const { errors } = useFormState({ name });
  const message: unknown = get(errors, name)?.message;
  return typeof message === "string" ? t(message) : undefined;
}

type TextFieldProps = {
  name: string;
  label: string;
  className?: string;
} & Pick<
  React.ComponentProps<"input">,
  "type" | "inputMode" | "autoCapitalize" | "spellCheck" | "autoFocus"
>;

export function TextField({ name, label, className, ...input }: TextFieldProps) {
  const { register } = useFormContext();
  const error = useFieldError(name);

  return (
    <Field data-invalid={!!error} className={className}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input id={name} autoComplete="off" aria-invalid={!!error} {...input} {...register(name)} />
      <FieldError>{error}</FieldError>
    </Field>
  );
}

export function TextareaField({
  name,
  label,
  className,
}: {
  name: string;
  label: string;
  className?: string;
}) {
  const { register } = useFormContext();
  const error = useFieldError(name);

  return (
    <Field data-invalid={!!error} className={className}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Textarea id={name} rows={3} aria-invalid={!!error} {...register(name)} />
      <FieldError>{error}</FieldError>
    </Field>
  );
}

/** Radix Select has no empty item value, so an optional choice is cleared through a stand-in. */
const NOT_SELECTED = "__not-selected__";

export function SelectField({
  name,
  label,
  options,
  clearable,
  className,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  /** Offers "Не выбрано", which stores "" (not undefined: the default value would come back). */
  clearable?: boolean;
  className?: string;
}) {
  const t = useTranslations("referenceBooks.form");
  const { control } = useFormContext();
  const error = useFieldError(name);

  return (
    <Field data-invalid={!!error} className={className}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select
            value={(field.value as string | undefined) ?? ""}
            onValueChange={(value) => field.onChange(value === NOT_SELECTED ? "" : value)}
          >
            <SelectTrigger
              id={name}
              ref={field.ref}
              onBlur={field.onBlur}
              aria-invalid={!!error}
              className="w-full"
            >
              <SelectValue placeholder={t("selectPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {clearable && (
                <SelectItem value={NOT_SELECTED} className="text-muted-foreground">
                  {t("notSelected")}
                </SelectItem>
              )}
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <FieldError>{error}</FieldError>
    </Field>
  );
}

/** The `address` of the form, filled whole or left empty (docs/ТЗ.md, 5.4). */
export function AddressFields() {
  const t = useTranslations();
  const locale = useLocale();
  const countries = useMemo(
    () => countryOptions(locale).map(({ code, name }) => ({ value: code, label: name })),
    [locale],
  );

  return (
    <>
      <div className="flex flex-col gap-2 md:col-span-2">
        <Separator />
        <h2 className="text-base font-semibold">{t("address.title")}</h2>
        <FieldDescription>{t("referenceBooks.form.addressHint")}</FieldDescription>
      </div>

      <TextField name="address.street" label={t("address.street")} className="md:col-span-2" />
      <TextField name="address.houseNumber" label={t("address.houseNumber")} inputMode="numeric" />
      <TextField name="address.houseNumberAddition" label={t("address.houseNumberAddition")} />
      <TextField
        name="address.postcode"
        label={t("address.postcode")}
        autoCapitalize="characters"
      />
      <TextField name="address.city" label={t("address.city")} />
      <SelectField name="address.country" label={t("address.country")} options={countries} />
    </>
  );
}

/** The form-wide error, "Создать" or "Сохранить", and "Отмена" back to where the form came from. */
export function FormFooter({
  editing,
  cancelHref,
  disabled,
}: {
  editing: boolean;
  cancelHref: string;
  disabled: boolean;
}) {
  const t = useTranslations("referenceBooks.form");
  const { errors } = useFormState();
  const serverError = errors.root?.server?.message;

  return (
    <>
      {serverError && <FieldError className="md:col-span-2">{serverError}</FieldError>}

      <div className="flex flex-wrap gap-2 md:col-span-2">
        <Button type="submit" disabled={disabled}>
          {t(editing ? "save" : "create")}
        </Button>
        <Button variant="outline" asChild>
          <Link href={cancelHref}>{t("cancel")}</Link>
        </Button>
      </div>
    </>
  );
}
