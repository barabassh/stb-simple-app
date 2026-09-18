"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";

import { updateOwnProfile } from "../actions";
import type { OwnProfile } from "../queries";
import { profileSchema, type ProfileInput } from "../schemas";

type ProfileFormProps = {
  profile: Pick<OwnProfile, "login" | "role" | "fullName" | "position" | "email" | "phone">;
};

export function ProfileForm({ profile }: ProfileFormProps) {
  const t = useTranslations();

  const form = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: profile.fullName,
      position: profile.position ?? "",
      email: profile.email ?? "",
      phone: profile.phone ?? "",
    },
  });
  const { errors, isDirty, isSubmitting } = form.formState;

  /** False when the save failed and the form shows why. */
  async function save(values: ProfileInput): Promise<boolean> {
    const result = await updateOwnProfile(values);
    if (result.ok) {
      toast.success(t("users.toasts.updated"));
      // The resolver hands over the values normalised by the schema, as they were stored.
      form.reset(values);
      return true;
    }

    for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
      if (messages?.[0]) form.setError(field as keyof ProfileInput, { message: messages[0] });
    }
    if (result.error) {
      form.setError("root.server", { message: t(result.error, result.errorValues) });
    }
    return false;
  }

  async function saveBeforeLeaving(): Promise<boolean> {
    let saved = false;
    await form.handleSubmit(async (values) => {
      saved = await save(values);
    })();
    return saved;
  }

  const fieldError = (message: string | undefined) => message && t(message);

  return (
    <>
      <UnsavedChangesGuard when={isDirty} onSave={saveBeforeLeaving} />
      <form
        onSubmit={form.handleSubmit(async (values) => {
          await save(values);
        })}
        noValidate
      >
        <FieldGroup className="grid md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="login">{t("users.fields.login")}</FieldLabel>
            <Input id="login" value={profile.login} disabled readOnly />
            <FieldDescription>{t("users.form.loginLocked")}</FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="role">{t("users.fields.role")}</FieldLabel>
            <Input id="role" value={t(`users.roles.${profile.role}`)} disabled readOnly />
            <FieldDescription>{t("profile.roleLocked")}</FieldDescription>
          </Field>

          <Field data-invalid={!!errors.fullName}>
            <FieldLabel htmlFor="fullName">{t("users.fields.fullName")}</FieldLabel>
            <Input
              id="fullName"
              autoComplete="name"
              aria-invalid={!!errors.fullName}
              {...form.register("fullName")}
            />
            <FieldError>{fieldError(errors.fullName?.message)}</FieldError>
          </Field>

          <Field data-invalid={!!errors.position}>
            <FieldLabel htmlFor="position">{t("users.fields.position")}</FieldLabel>
            <Input
              id="position"
              autoComplete="organization-title"
              aria-invalid={!!errors.position}
              {...form.register("position")}
            />
            <FieldError>{fieldError(errors.position?.message)}</FieldError>
          </Field>

          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="email">{t("users.fields.email")}</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={!!errors.email}
              {...form.register("email")}
            />
            <FieldError>{fieldError(errors.email?.message)}</FieldError>
          </Field>

          <Field data-invalid={!!errors.phone}>
            <FieldLabel htmlFor="phone">{t("users.fields.phone")}</FieldLabel>
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              aria-invalid={!!errors.phone}
              {...form.register("phone")}
            />
            <FieldError>{fieldError(errors.phone?.message)}</FieldError>
          </Field>

          {errors.root?.server && (
            <FieldError className="md:col-span-2">{errors.root.server.message}</FieldError>
          )}

          <div className="md:col-span-2">
            <Button type="submit" disabled={isSubmitting}>
              {t("users.form.save")}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </>
  );
}
