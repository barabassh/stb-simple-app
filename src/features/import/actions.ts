"use server";

import type { SessionUser } from "@/lib/auth/session";
import { authorizedAction } from "@/lib/auth/authorized-action";
import { importFailure, type ImportDefinition, type ImportResult } from "@/lib/import";
import { runImportCheck, runImportConfirm } from "@/lib/import/service";

import { findImportDefinition } from "./definitions";

// The two steps of every import as server actions (docs/АРХИТЕКТУРА.md, 3.11). The name picks the
// import and its permission guards the action: a check writes nothing, but it reads the data of the
// section and names its records, so it is allowed to the same users as the write.

type Run = (
  definition: ImportDefinition,
  actor: SessionUser,
  formData: FormData,
) => Promise<ImportResult>;

async function runImport(name: string, formData: FormData, run: Run): Promise<ImportResult> {
  const definition = findImportDefinition(name);
  if (!definition) return importFailure("errors.invalidRequest");

  const guarded = authorizedAction(definition.permission, async (actor) => ({
    ok: true as const,
    result: await run(definition, actor, formData),
  }));
  const outcome = await guarded();
  return outcome.ok ? outcome.result : importFailure(outcome.error ?? "errors.forbiddenAction");
}

/** The preview of the file: what would be written and what is wrong with the rest. */
export async function checkImportFile(name: string, formData: FormData): Promise<ImportResult> {
  return runImport(name, formData, runImportCheck);
}

/** Writes every row of the file, or nothing at all (docs/ТЗ.md, 7.13). */
export async function confirmImportFile(name: string, formData: FormData): Promise<ImportResult> {
  return runImport(name, formData, runImportConfirm);
}
