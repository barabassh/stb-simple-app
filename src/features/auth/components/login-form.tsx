"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { signIn } from "../actions";
import { loginSchema, type LoginInput } from "../schemas";

export function LoginForm() {
  const t = useTranslations();
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { login: "", password: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: LoginInput) {
    const result = await signIn(values);
    if (!result) return;

    for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
      if (messages?.[0]) form.setError(field as keyof LoginInput, { message: messages[0] });
    }
    if (result.error) {
      form.setError("root.server", { message: t(result.error, result.errorValues) });
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.login}>
          <FieldLabel htmlFor="login">{t("auth.login.login")}</FieldLabel>
          <Input
            id="login"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            aria-invalid={!!errors.login}
            {...form.register("login")}
          />
          <FieldError>{errors.login?.message && t(errors.login.message)}</FieldError>
        </Field>

        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="password">{t("auth.login.password")}</FieldLabel>
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...form.register("password")}
          />
          <FieldError>{errors.password?.message && t(errors.password.message)}</FieldError>
        </Field>

        <Field orientation="horizontal">
          <Checkbox
            id="show-password"
            checked={showPassword}
            onCheckedChange={(checked) => setShowPassword(checked === true)}
          />
          <FieldLabel htmlFor="show-password" className="font-normal">
            {t("auth.login.showPassword")}
          </FieldLabel>
        </Field>

        {errors.root?.server && <FieldError>{errors.root.server.message}</FieldError>}

        <Button type="submit" size="lg" disabled={isSubmitting}>
          {t("auth.login.submit")}
        </Button>
      </FieldGroup>
    </form>
  );
}
