"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FormProvider, type FieldValues, type Path, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";

import { FieldGroup } from "@/components/ui/field";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import type { ActionResult } from "@/lib/action-result";

import { FormFooter } from "./form-fields";
import type { ReferenceSection } from "./list-params";

/** The project form works the same way, on its own routes and messages. */
type FormSection = ReferenceSection | "projects";

type ReferenceFormProps<TInput extends FieldValues, TOutput> = {
  section: FormSection;
  form: UseFormReturn<TInput, unknown, TOutput>;
  /** The record being edited; omitted when creating one. */
  recordId?: string;
  /** Creates or updates the record; a success carries the id of the saved record. */
  save: (values: TOutput) => Promise<ActionResult<{ id: string }>>;
  children: React.ReactNode;
};

/**
 * The create and edit form of a reference book record: server errors under the fields, a toast
 * and the card after a save, and the question about unsaved changes before leaving.
 */
export function ReferenceForm<TInput extends FieldValues, TOutput>({
  section,
  form,
  recordId,
  save,
  children,
}: ReferenceFormProps<TInput, TOutput>) {
  const t = useTranslations();
  const router = useRouter();
  const { isDirty, isSubmitting, isSubmitSuccessful } = form.formState;

  /** The id of the saved record, or null when the save failed and the form shows why. */
  async function saveValues(values: TOutput): Promise<string | null> {
    const result = await save(values);
    if (!result.ok) {
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (messages?.[0]) form.setError(field as Path<TInput>, { message: messages[0] });
      }
      if (result.error) {
        form.setError("root.server", { message: t(result.error, result.errorValues) });
      }
      return null;
    }
    toast.success(t(`${section}.toasts.${recordId ? "updated" : "created"}`));
    return result.id;
  }

  async function onSubmit(values: TOutput) {
    const id = await saveValues(values);
    if (id) router.push(`/${section}/${id}`);
  }

  async function saveBeforeLeaving(): Promise<boolean> {
    let saved = false;
    await form.handleSubmit(async (values) => {
      saved = (await saveValues(values)) !== null;
    })();
    return saved;
  }

  return (
    <FormProvider {...form}>
      <UnsavedChangesGuard when={isDirty && !isSubmitSuccessful} onSave={saveBeforeLeaving} />
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup className="grid grid-cols-1 md:grid-cols-2">
          {children}
          <FormFooter
            editing={!!recordId}
            cancelHref={recordId ? `/${section}/${recordId}` : `/${section}`}
            disabled={isSubmitting || isSubmitSuccessful}
          />
        </FieldGroup>
      </form>
    </FormProvider>
  );
}
