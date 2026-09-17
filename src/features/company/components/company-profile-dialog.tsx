"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PencilIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { FormProvider, useForm, type Path } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import type { ActionFailure } from "@/lib/action-result";

import { saveCompanyProfile } from "../actions";
import { companyFormSchema, type CompanyFormInput, type CompanyFormValues } from "../schemas";
import {
  ActivitiesFields,
  MainFields,
  PhonesFields,
  PostalAddressFields,
  RequisitesFields,
  SocialLinksFields,
  WarehousesFields,
} from "./company-form-fields";

/** Lists whose own errors (not their rows') the form keeps under `<list>.root`. */
const LIST_FIELDS = new Set(["warehouses", "phones", "socialLinks", "activities"]);

type CompanyProfileDialogProps = {
  /** The saved profile as form values, or empty values while it is not filled. */
  defaultValues: CompanyFormInput;
  /** "fill" in the empty state, "edit" in the block header. */
  mode: "fill" | "edit";
};

export function CompanyProfileDialog({ defaultValues, mode }: CompanyProfileDialogProps) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const form = useForm<CompanyFormInput, unknown, CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
    defaultValues,
    // Errors are brought into view in the order they appear on screen, see the effect below.
    shouldFocusError: false,
  });
  const { isDirty, isSubmitting, errors, submitCount } = form.formState;

  // submitCount is published together with the errors of that submit, validation and server ones
  // alike, while an onInvalid callback runs before the errors reach the fields.
  useEffect(() => {
    if (submitCount === 0) return;
    const invalid = bodyRef.current?.querySelector('[data-invalid="true"]');
    if (!invalid) return;
    invalid.scrollIntoView({ block: "center" });
    invalid.querySelector<HTMLElement>("input, textarea, button")?.focus({ preventScroll: true });
  }, [submitCount]);

  function openDialog() {
    // The profile may have been saved since the page was rendered: start from the current values.
    form.reset(defaultValues);
    setOpen(true);
  }

  function requestClose() {
    if (isSubmitting) return;
    if (isDirty) setConfirmingClose(true);
    else setOpen(false);
  }

  function showFailure(failure: ActionFailure) {
    for (const [field, messages] of Object.entries(failure.fieldErrors ?? {})) {
      if (!messages?.[0]) continue;
      const name = LIST_FIELDS.has(field) ? `${field}.root` : field;
      form.setError(name as Path<CompanyFormInput>, { message: messages[0] });
    }
    if (failure.error) {
      form.setError("root.server", { message: t(failure.error, failure.errorValues) });
    }
  }

  async function onSubmit(values: CompanyFormValues) {
    const result = await saveCompanyProfile(values);
    if (!result.ok) {
      showFailure(result);
      return;
    }
    setOpen(false);
    toast.success(t("settings.company.toasts.saved"));
  }

  return (
    <>
      <Button onClick={openDialog}>
        {mode === "edit" && <PencilIcon aria-hidden />}
        {t(mode === "edit" ? "settings.company.edit" : "settings.company.fill")}
      </Button>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : requestClose())}>
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            form.setFocus("legalName");
          }}
          // Full screen below 768 px; a centred dialog of limited height above it (docs/ТЗ.md, 5.7).
          className="top-0 left-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none p-0 sm:max-w-none md:top-1/2 md:left-1/2 md:h-auto md:max-h-[calc(100dvh-4rem)] md:max-w-[min(48rem,calc(100%-2rem))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl"
        >
          <DialogHeader className="flex-row items-center justify-between gap-4 border-b px-4 py-3 md:px-6 md:py-4">
            <DialogTitle className="text-lg font-semibold">
              {t("settings.company.dialog.title")}
            </DialogTitle>
            <DialogClose asChild>
              <Button variant="ghost" size="icon" disabled={isSubmitting}>
                <XIcon aria-hidden />
                <span className="sr-only">{t("settings.company.dialog.close")}</span>
              </Button>
            </DialogClose>
          </DialogHeader>

          <FormProvider {...form}>
            <form
              noValidate
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={form.handleSubmit(onSubmit)}
            >
              <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
                <FieldGroup>
                  <MainFields />
                  <RequisitesFields />
                  <PostalAddressFields />
                  <WarehousesFields />
                  <PhonesFields />
                  <SocialLinksFields />
                  <ActivitiesFields />
                </FieldGroup>
              </div>

              {errors.root?.server && (
                <p
                  role="alert"
                  className="border-t bg-destructive/10 px-4 py-3 text-sm text-destructive md:px-6"
                >
                  {errors.root.server.message}
                </p>
              )}

              <DialogFooter className="mx-0 mb-0 flex-row justify-end rounded-none px-4 py-3 md:rounded-b-xl md:px-6">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={requestClose}
                >
                  {t("settings.company.dialog.cancel")}
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {t(
                    isSubmitting
                      ? "settings.company.dialog.saving"
                      : "settings.company.dialog.save",
                  )}
                </Button>
              </DialogFooter>
            </form>
          </FormProvider>

          <Dialog open={confirmingClose} onOpenChange={setConfirmingClose}>
            <DialogContent showCloseButton={false}>
              <DialogHeader>
                <DialogTitle>{t("settings.company.dialog.confirmCloseTitle")}</DialogTitle>
                <DialogDescription>
                  {t("settings.company.dialog.confirmCloseDescription")}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmingClose(false)}>
                  {t("settings.company.dialog.confirmCloseKeep")}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setConfirmingClose(false);
                    setOpen(false);
                  }}
                >
                  {t("settings.company.dialog.confirmCloseDiscard")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </DialogContent>
      </Dialog>
    </>
  );
}
