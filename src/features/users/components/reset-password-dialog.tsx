"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { resetPassword } from "../actions";
import { resetPasswordSchema, type ResetPasswordInput } from "../schemas";

type ResetPasswordDialogProps = {
  user: { id: string; login: string; fullName: string };
  onClose: () => void;
};

/** Rendered only while open, so every opening starts with an empty form. */
export function ResetPasswordDialog({ user, onClose }: ResetPasswordDialogProps) {
  const t = useTranslations();
  const passwordId = useId();
  const showPasswordId = useId();
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { login: user.login, password: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit({ password }: ResetPasswordInput) {
    const result = await resetPassword(user.id, { password });
    if (result.ok) {
      toast.success(t("users.toasts.passwordReset"));
      onClose();
      return;
    }

    for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
      if (messages?.[0]) form.setError(field as keyof ResetPasswordInput, { message: messages[0] });
    }
    if (result.error) {
      form.setError("root.server", { message: t(result.error, result.errorValues) });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent showCloseButton={false}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("users.dialogs.resetPassword.title")}</DialogTitle>
            <DialogDescription>
              {t("users.dialogs.resetPassword.description", { name: user.fullName })}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor={passwordId}>
                {t("users.dialogs.resetPassword.newPassword")}
              </FieldLabel>
              <Input
                id={passwordId}
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                autoFocus
                aria-invalid={!!errors.password}
                {...form.register("password")}
              />
              <FieldDescription>{t("users.form.passwordHint")}</FieldDescription>
              <FieldError>{errors.password?.message && t(errors.password.message)}</FieldError>
            </Field>

            <Field orientation="horizontal">
              <Checkbox
                id={showPasswordId}
                checked={showPassword}
                onCheckedChange={(checked) => setShowPassword(checked === true)}
              />
              <FieldLabel htmlFor={showPasswordId} className="font-normal">
                {t("users.form.showPassword")}
              </FieldLabel>
            </Field>

            {errors.root?.server && <FieldError>{errors.root.server.message}</FieldError>}
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSubmitting} onClick={onClose}>
              {t("users.actions.cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {t("users.dialogs.resetPassword.confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
