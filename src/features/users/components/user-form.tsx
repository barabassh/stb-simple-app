"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionFailure } from "@/lib/action-result";
import type { SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";

import { createUser, updateUser } from "../actions";
import { USER_ROLES } from "../list-params";
import type { UserDetails } from "../queries";
import { createUserSchema, editUserFormSchema, type CreateUserInput } from "../schemas";

type UserFormProps = {
  /** The user being edited; omitted when creating one. */
  user?: UserDetails;
  viewer: Pick<SessionUser, "role">;
};

function toFormValues(user: UserDetails | undefined): CreateUserInput {
  return {
    login: user?.login ?? "",
    password: "",
    fullName: user?.fullName ?? "",
    position: user?.position ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    role: user?.role ?? "EMPLOYEE",
    isActive: user?.isActive ?? true,
    comment: user?.comment ?? "",
  };
}

export function UserForm({ user, viewer }: UserFormProps) {
  const t = useTranslations();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);

  // Creating a user sets the role and the status as part of users.create.
  const roleLocked = !!user && !can(viewer, "users.changeRole");
  const statusLocked = !!user && !can(viewer, "users.changeStatus");

  const form = useForm<CreateUserInput>({
    resolver: zodResolver(user ? editUserFormSchema : createUserSchema),
    defaultValues: toFormValues(user),
  });
  const { errors, isSubmitting, isSubmitSuccessful } = form.formState;

  function showFailure(failure: ActionFailure) {
    for (const [field, messages] of Object.entries(failure.fieldErrors ?? {})) {
      if (messages?.[0]) form.setError(field as keyof CreateUserInput, { message: messages[0] });
    }
    if (failure.error) {
      form.setError("root.server", { message: t(failure.error, failure.errorValues) });
    }
  }

  function finish(successMessage: string, userId: string) {
    toast.success(t(successMessage));
    router.push(`/users/${userId}`);
  }

  async function onSubmit(values: CreateUserInput) {
    if (user) {
      const result = await updateUser(user.id, values);
      if (result.ok) finish("users.toasts.updated", user.id);
      else showFailure(result);
    } else {
      const result = await createUser(values);
      if (result.ok) finish("users.toasts.created", result.id);
      else showFailure(result);
    }
  }

  const fieldError = (message: string | undefined) => message && t(message);

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup className="grid md:grid-cols-2">
        <Field data-invalid={!!errors.login}>
          <FieldLabel htmlFor="login">{t("users.fields.login")}</FieldLabel>
          {user ? (
            <Input id="login" value={user.login} disabled readOnly />
          ) : (
            <Input
              id="login"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              aria-invalid={!!errors.login}
              {...form.register("login")}
            />
          )}
          <FieldDescription>
            {t(user ? "users.form.loginLocked" : "users.form.loginHint")}
          </FieldDescription>
          <FieldError>{fieldError(errors.login?.message)}</FieldError>
        </Field>

        {!user && (
          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="password">{t("users.fields.password")}</FieldLabel>
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              {...form.register("password")}
            />
            <FieldDescription>{t("users.form.passwordHint")}</FieldDescription>
            <FieldError>{fieldError(errors.password?.message)}</FieldError>
            <Field orientation="horizontal">
              <Checkbox
                id="show-password"
                checked={showPassword}
                onCheckedChange={(checked) => setShowPassword(checked === true)}
              />
              <FieldLabel htmlFor="show-password" className="font-normal">
                {t("users.form.showPassword")}
              </FieldLabel>
            </Field>
          </Field>
        )}

        <Field data-invalid={!!errors.fullName}>
          <FieldLabel htmlFor="fullName">{t("users.fields.fullName")}</FieldLabel>
          <Input
            id="fullName"
            autoComplete="off"
            aria-invalid={!!errors.fullName}
            {...form.register("fullName")}
          />
          <FieldError>{fieldError(errors.fullName?.message)}</FieldError>
        </Field>

        <Field data-invalid={!!errors.position}>
          <FieldLabel htmlFor="position">{t("users.fields.position")}</FieldLabel>
          <Input
            id="position"
            autoComplete="off"
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
            autoComplete="off"
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
            autoComplete="off"
            aria-invalid={!!errors.phone}
            {...form.register("phone")}
          />
          <FieldError>{fieldError(errors.phone?.message)}</FieldError>
        </Field>

        <Field data-invalid={!!errors.role}>
          <FieldLabel htmlFor="role">{t("users.fields.role")}</FieldLabel>
          <Controller
            control={form.control}
            name="role"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={roleLocked}>
                <SelectTrigger
                  id="role"
                  ref={field.ref}
                  onBlur={field.onBlur}
                  aria-invalid={!!errors.role}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USER_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {t(`users.roles.${role}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError>{fieldError(errors.role?.message)}</FieldError>
        </Field>

        <Field orientation="horizontal" className="md:col-span-2">
          <Controller
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <Checkbox
                id="isActive"
                ref={field.ref}
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
                onBlur={field.onBlur}
                disabled={statusLocked}
              />
            )}
          />
          <FieldLabel htmlFor="isActive" className="font-normal">
            {t("users.fields.isActive")}
          </FieldLabel>
        </Field>

        <Field data-invalid={!!errors.comment} className="md:col-span-2">
          <FieldLabel htmlFor="comment">{t("users.fields.comment")}</FieldLabel>
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
            {t(user ? "users.form.save" : "users.form.create")}
          </Button>
          <Button variant="outline" asChild>
            <Link href={user ? `/users/${user.id}` : "/users"}>{t("users.form.cancel")}</Link>
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
