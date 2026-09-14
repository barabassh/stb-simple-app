"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";

import type { ActionResult } from "@/lib/action-result";

type RunOptions = {
  /** Called after success and failure alike, e.g. to close a confirmation dialog. */
  onSettled?: () => void;
};

/** Runs a server action that has no form of its own and reports the outcome in a toast. */
export function useRunAction() {
  const t = useTranslations();
  const [isPending, startTransition] = useTransition();

  function run(
    action: () => Promise<ActionResult>,
    successMessage: string,
    { onSettled }: RunOptions = {},
  ) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(t(successMessage));
      } else {
        toast.error(t(result.error ?? "users.errors.invalidRequest", result.errorValues));
      }
      onSettled?.();
    });
  }

  return { run, isPending };
}
