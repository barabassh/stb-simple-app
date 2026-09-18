"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useMemo } from "react";
import {
  Controller,
  get,
  useFieldArray,
  useFormContext,
  useFormState,
  useWatch,
  type Path,
} from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { LegalForm, SocialNetwork } from "@/generated/prisma/enums";
import { displayTodayIso } from "@/lib/format";
import { countryOptions } from "@/lib/nl/countries";

import { emptyStreetAddress } from "../form-values";
import { COMPANY_LIST_LIMITS, type CompanyFormInput } from "../schemas";

type FieldName = Path<CompanyFormInput>;

const path = (...parts: (string | number)[]) => parts.join(".") as FieldName;

/** The message key of a field error, translated; list-wide errors are kept under `root`. */
function useFieldError(name: FieldName): string | undefined {
  const t = useTranslations();
  const { errors } = useFormState<CompanyFormInput>({ name });
  const error = get(errors, name);
  const message: unknown = error?.message ?? error?.root?.message;
  return typeof message === "string" ? t(message) : undefined;
}

function FieldCaption({
  htmlFor,
  label,
  required,
}: {
  htmlFor: string;
  label: string;
  required?: boolean;
}) {
  return (
    <FieldLabel htmlFor={htmlFor}>
      <span>
        {label}
        {required && <span aria-hidden> *</span>}
      </span>
    </FieldLabel>
  );
}

type TextFieldProps = {
  name: FieldName;
  label: string;
  required?: boolean;
  className?: string;
  description?: string;
} & Pick<
  React.ComponentProps<"input">,
  "type" | "inputMode" | "autoComplete" | "max" | "autoCapitalize" | "spellCheck" | "placeholder"
>;

function TextField({ name, label, required, className, description, ...input }: TextFieldProps) {
  const { register } = useFormContext<CompanyFormInput>();
  const error = useFieldError(name);

  return (
    <Field data-invalid={!!error} className={className}>
      <FieldCaption htmlFor={name} label={label} required={required} />
      <Input
        id={name}
        autoComplete="off"
        aria-required={required}
        aria-invalid={!!error}
        {...input}
        {...register(name)}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  );
}

/** Radix Select has no empty item value, so an optional choice is cleared through a stand-in. */
const NOT_SELECTED = "__not-selected__";

function SelectField({
  name,
  label,
  className,
  options,
  clearable,
}: {
  name: FieldName;
  label: string;
  className?: string;
  options: { value: string; label: string }[];
  clearable?: boolean;
}) {
  const t = useTranslations("settings.company.dialog");
  const { control } = useFormContext<CompanyFormInput>();
  const error = useFieldError(name);

  return (
    <Field data-invalid={!!error} className={className}>
      <FieldCaption htmlFor={name} label={label} />
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select
            value={(field.value as string | undefined) ?? ""}
            // Not undefined: Controller would show the default value again.
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

function CheckboxField({
  name,
  label,
  onCheckedChange,
}: {
  name: FieldName;
  label: string;
  onCheckedChange?: (checked: boolean) => void;
}) {
  const { control } = useFormContext<CompanyFormInput>();

  return (
    <Field orientation="horizontal">
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Checkbox
            id={name}
            ref={field.ref}
            checked={field.value === true}
            onCheckedChange={(checked) => {
              field.onChange(checked === true);
              onCheckedChange?.(checked === true);
            }}
            onBlur={field.onBlur}
          />
        )}
      />
      <FieldLabel htmlFor={name} className="font-normal">
        {label}
      </FieldLabel>
    </Field>
  );
}

function useCountryOptions() {
  const locale = useLocale();
  return useMemo(
    () => countryOptions(locale).map(({ code, name }) => ({ value: code, label: name })),
    [locale],
  );
}

/** Street, house number and addition in one row; postcode and city in the next; then the country. */
function StreetAddressFields({ prefix }: { prefix: string }) {
  const t = useTranslations("address");
  const countries = useCountryOptions();

  return (
    <>
      <div className="grid gap-5 md:grid-cols-[4fr_3fr_3fr]">
        <TextField name={path(prefix, "street")} label={t("street")} />
        <TextField
          name={path(prefix, "houseNumber")}
          label={t("houseNumber")}
          inputMode="numeric"
        />
        <TextField name={path(prefix, "houseNumberAddition")} label={t("houseNumberAddition")} />
      </div>
      <PlaceFields prefix={prefix} countries={countries} />
    </>
  );
}

function PlaceFields({
  prefix,
  countries,
}: {
  prefix: string;
  countries: { value: string; label: string }[];
}) {
  const t = useTranslations("address");

  return (
    <>
      <div className="grid gap-5 md:grid-cols-[2fr_3fr]">
        <TextField
          name={path(prefix, "postcode")}
          label={t("postcode")}
          autoCapitalize="characters"
        />
        <TextField name={path(prefix, "city")} label={t("city")} />
      </div>
      <div className="grid gap-5 md:grid-cols-[2fr_3fr]">
        <SelectField name={path(prefix, "country")} label={t("country")} options={countries} />
      </div>
    </>
  );
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Separator />
      <h3 className="text-base font-semibold">{children}</h3>
    </>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" variant="outline" className="self-start" onClick={onClick}>
      <PlusIcon aria-hidden />
      {children}
    </Button>
  );
}

function RemoveButton({ onClick, item }: { onClick: () => void; item: string }) {
  const t = useTranslations("settings.company.dialog");

  return (
    <Button
      type="button"
      variant="ghost"
      className="text-destructive"
      onClick={onClick}
      aria-label={t("removeItem", { item })}
    >
      <Trash2Icon aria-hidden />
      <span>{t("remove")}</span>
    </Button>
  );
}

/** The first part repeats the layout of the sample dialog (docs/ТЗ.md, 5.7). */
export function MainFields() {
  const t = useTranslations("settings.company");

  return (
    <>
      <TextField name="legalName" label={t("fields.legalName")} required />
      <StreetAddressFields prefix="officeAddress" />
      <Separator />
      <TextField name="website" label={t("fields.website")} inputMode="url" />
      <div className="grid gap-5 md:grid-cols-2">
        <TextField
          name="email"
          label={t("fields.email")}
          type="email"
          autoCapitalize="none"
          spellCheck={false}
        />
        <TextField name="phone" label={t("fields.phone")} type="tel" />
      </div>
      <div className="grid gap-x-5 gap-y-2">
        <div className="grid gap-5 md:grid-cols-3">
          <TextField name="kvkNumber" label={t("fields.kvkNumber")} inputMode="numeric" />
          <TextField name="vatId" label={t("fields.vatId")} autoCapitalize="characters" />
          <TextField name="vatNumber" label={t("fields.vatNumber")} autoCapitalize="characters" />
        </div>
        <FieldDescription>{t("dialog.vatHint")}</FieldDescription>
      </div>
    </>
  );
}

export function RequisitesFields() {
  const t = useTranslations("settings.company");
  const legalForms = Object.values(LegalForm).map((value) => ({
    value,
    label: t(`legalForms.${value}`),
  }));

  return (
    <>
      <GroupHeading>{t("groups.requisites")}</GroupHeading>
      <div className="grid gap-5 md:grid-cols-2">
        <TextField name="tradeName" label={t("fields.tradeName")} />
        <SelectField
          name="legalForm"
          label={t("fields.legalForm")}
          options={legalForms}
          clearable
        />
        <TextField
          name="registeredOn"
          label={t("fields.registeredOn")}
          type="date"
          max={displayTodayIso()}
        />
        <TextField name="statutorySeat" label={t("fields.statutorySeat")} />
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        <TextField
          name="establishmentNumber"
          label={t("fields.establishmentNumber")}
          inputMode="numeric"
        />
        <TextField name="rsin" label={t("fields.rsin")} inputMode="numeric" />
        <TextField
          name="payrollTaxNumber"
          label={t("fields.payrollTaxNumber")}
          autoCapitalize="characters"
        />
      </div>
    </>
  );
}

export function PostalAddressFields() {
  const t = useTranslations("settings.company");
  const countries = useCountryOptions();
  const [sameAsOffice, isPostbus] = useWatch<
    CompanyFormInput,
    ["postalSameAsOffice", "postalAddress.isPostbus"]
  >({
    name: ["postalSameAsOffice", "postalAddress.isPostbus"],
  });

  return (
    <>
      <GroupHeading>{t("groups.postalAddress")}</GroupHeading>
      <CheckboxField name="postalSameAsOffice" label={t("fields.postalSameAsOffice")} />
      {!sameAsOffice && (
        <>
          <CheckboxField name="postalAddress.isPostbus" label={t("dialog.postalIsPostbus")} />
          {isPostbus ? (
            <>
              <div className="grid gap-5 md:grid-cols-[2fr_3fr]">
                <TextField
                  name="postalAddress.postbus"
                  label={t("fields.postbus")}
                  inputMode="numeric"
                />
              </div>
              <PlaceFields prefix="postalAddress" countries={countries} />
            </>
          ) : (
            <StreetAddressFields prefix="postalAddress" />
          )}
        </>
      )}
    </>
  );
}

function ListItem({
  title,
  onRemove,
  children,
}: {
  title: string;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const titleId = useId();

  return (
    <div
      role="group"
      aria-labelledby={titleId}
      className="flex min-w-0 flex-col gap-4 rounded-lg border p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <p id={titleId} className="text-sm font-medium">
          {title}
        </p>
        <RemoveButton onClick={onRemove} item={title} />
      </div>
      {children}
    </div>
  );
}

export function WarehousesFields() {
  const t = useTranslations("settings.company");
  const { fields, append, remove } = useFieldArray<CompanyFormInput, "warehouses", "key">({
    name: "warehouses",
    keyName: "key",
  });

  return (
    <>
      <GroupHeading>{t("groups.warehouses")}</GroupHeading>
      {fields.map((field, index) => (
        <ListItem
          key={field.key}
          title={t("dialog.warehouse", { number: index + 1 })}
          onRemove={() => remove(index)}
        >
          <TextField name={path("warehouses", index, "name")} label={t("fields.warehouseName")} />
          <StreetAddressFields prefix={`warehouses.${index}`} />
        </ListItem>
      ))}
      {fields.length < COMPANY_LIST_LIMITS.warehouses && (
        <AddButton onClick={() => append({ name: "", ...emptyStreetAddress })}>
          {t("dialog.addWarehouse")}
        </AddButton>
      )}
    </>
  );
}

export function PhonesFields() {
  const t = useTranslations("settings.company");
  const { fields, append, remove } = useFieldArray<CompanyFormInput, "phones", "key">({
    name: "phones",
    keyName: "key",
  });

  return (
    <>
      <GroupHeading>{t("groups.phones")}</GroupHeading>
      {fields.map((field, index) => (
        <ListItem
          key={field.key}
          title={t("dialog.phone", { number: index + 1 })}
          onRemove={() => remove(index)}
        >
          <div className="grid gap-5 md:grid-cols-2">
            <TextField name={path("phones", index, "label")} label={t("fields.phoneLabel")} />
            <TextField
              name={path("phones", index, "number")}
              label={t("fields.phoneNumber")}
              type="tel"
            />
          </div>
        </ListItem>
      ))}
      {fields.length < COMPANY_LIST_LIMITS.phones && (
        <AddButton onClick={() => append({ label: "", number: "" })}>
          {t("dialog.addPhone")}
        </AddButton>
      )}
    </>
  );
}

export function SocialLinksFields() {
  const t = useTranslations("settings.company");
  const { fields, append, remove } = useFieldArray<CompanyFormInput, "socialLinks", "key">({
    name: "socialLinks",
    keyName: "key",
  });
  const networks = Object.values(SocialNetwork).map((value) => ({
    value,
    label: t(`socialNetworks.${value}`),
  }));

  return (
    <>
      <GroupHeading>{t("groups.socialLinks")}</GroupHeading>
      {fields.map((field, index) => (
        <ListItem
          key={field.key}
          title={t("dialog.socialLink", { number: index + 1 })}
          onRemove={() => remove(index)}
        >
          <div className="grid gap-5 md:grid-cols-[2fr_5fr]">
            <SelectField
              name={path("socialLinks", index, "network")}
              label={t("fields.socialNetwork")}
              options={networks}
              clearable
            />
            <TextField
              name={path("socialLinks", index, "url")}
              label={t("fields.socialLinkUrl")}
              type="url"
              placeholder="https://"
            />
          </div>
        </ListItem>
      ))}
      {fields.length < COMPANY_LIST_LIMITS.socialLinks && (
        <AddButton onClick={() => append({ network: "", url: "" }, { shouldFocus: false })}>
          {t("dialog.addSocialLink")}
        </AddButton>
      )}
    </>
  );
}

export function ActivitiesFields() {
  const t = useTranslations("settings.company");
  const { control, setValue, getValues } = useFormContext<CompanyFormInput>();
  const { fields, append, remove } = useFieldArray<CompanyFormInput, "activities", "key">({
    control,
    name: "activities",
    keyName: "key",
  });
  const listError = useFieldError("activities");

  // Only one activity is the main one: ticking another clears the previous mark.
  function markMain(index: number, checked: boolean) {
    if (!checked) return;
    getValues("activities").forEach((activity, other) => {
      if (other !== index && activity.isMain) {
        setValue(path("activities", other, "isMain"), false, { shouldDirty: true });
      }
    });
  }

  return (
    <>
      <GroupHeading>{t("groups.activities")}</GroupHeading>
      <FieldDescription>{t("dialog.sbiHint")}</FieldDescription>
      {fields.map((field, index) => (
        <ListItem
          key={field.key}
          title={t("dialog.activity", { number: index + 1 })}
          onRemove={() => remove(index)}
        >
          <div className="grid gap-5 md:grid-cols-[1fr_4fr]">
            <TextField
              name={path("activities", index, "sbiCode")}
              label={t("fields.sbiCode")}
              inputMode="numeric"
            />
            <TextField
              name={path("activities", index, "description")}
              label={t("fields.activityDescription")}
            />
          </div>
          <CheckboxField
            name={path("activities", index, "isMain")}
            label={t("fields.isMain")}
            onCheckedChange={(checked) => markMain(index, checked)}
          />
        </ListItem>
      ))}
      {listError && (
        <Field data-invalid>
          <FieldError>{listError}</FieldError>
        </Field>
      )}
      {fields.length < COMPANY_LIST_LIMITS.activities && (
        <AddButton
          onClick={() => append({ sbiCode: "", description: "", isMain: fields.length === 0 })}
        >
          {t("dialog.addActivity")}
        </AddButton>
      )}
      <ActivityDescriptionField />
    </>
  );
}

function ActivityDescriptionField() {
  const t = useTranslations("settings.company.fields");
  const { register } = useFormContext<CompanyFormInput>();
  const error = useFieldError("activityDescription");

  return (
    <Field data-invalid={!!error}>
      <FieldCaption htmlFor="activityDescription" label={t("activitiesDescription")} />
      <Textarea
        id="activityDescription"
        rows={4}
        aria-invalid={!!error}
        {...register("activityDescription")}
      />
      <FieldError>{error}</FieldError>
    </Field>
  );
}
