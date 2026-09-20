import type { SessionUser } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getClientInfo } from "@/lib/request-info";

import {
  IMPORT_FILE_EXTENSION,
  IMPORT_FILE_FIELD,
  IMPORT_OPTION_PREFIX,
  ImportStale,
  importFailure,
  MAX_IMPORT_FILE_BYTES,
  type ImportDefinition,
  type ImportFailure,
  type ImportOptions,
  type ImportPreviewRow,
  type ImportResult,
  type ImportRow,
  type ParsedRow,
  type RowResult,
} from ".";
import { parseImportFile } from "./parse";

// The two steps of any import (docs/ТЗ.md, 7.13): a check that shows the preview and writes
// nothing, and a confirmation that reads the same file again, checks it again and writes every row
// in one transaction — or nothing at all.

const MEGABYTE = 1024 * 1024;

type Submission = {
  file: ArrayBuffer;
  fileName: string;
  options: ImportOptions;
};

/** The file the browser sent and the ticked options, refused before anything is read of it. */
async function readSubmission(
  definition: ImportDefinition,
  formData: FormData,
): Promise<Submission | ImportFailure> {
  const file = formData.get(IMPORT_FILE_FIELD);
  if (!(file instanceof File) || file.size === 0) return importFailure("import.errors.noFile");
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return importFailure("import.errors.tooLarge", { size: MAX_IMPORT_FILE_BYTES / MEGABYTE });
  }
  if (!file.name.toLowerCase().endsWith(IMPORT_FILE_EXTENSION)) {
    return importFailure("import.errors.notXlsx");
  }

  const options = Object.fromEntries(
    definition.options.map((option) => [
      option,
      formData.get(`${IMPORT_OPTION_PREFIX}${option}`) === "true",
    ]),
  );
  return { file: await file.arrayBuffer(), fileName: file.name, options };
}

type Checked = {
  rows: ParsedRow<ImportRow>[];
  results: RowResult<unknown>[];
  preview: (results: RowResult<unknown>[], stale: boolean) => ImportResult;
};

const previewRow = (result: RowResult<unknown>): ImportPreviewRow => ({
  rowNumber: result.rowNumber,
  cells: result.cells,
  errors: "errors" in result ? result.errors : [],
});

async function checkFile(
  definition: ImportDefinition,
  actor: SessionUser,
  file: ArrayBuffer,
): Promise<Checked | ImportFailure> {
  const texts = await definition.texts();
  const parsed = await parseImportFile(file, texts.columns);
  if (parsed.kind === "failure") return parsed;

  const results = await definition.check(parsed.rows, actor);
  return {
    rows: parsed.rows,
    results,
    preview: (checkedRows, stale) => ({
      kind: "preview",
      columns: texts.columnsOfPreview,
      headers: Object.fromEntries(texts.columns.map((column) => [column.key, column.header])),
      rows: checkedRows.map(previewRow),
      ready: checkedRows.filter((result) => "ready" in result).length,
      stale,
    }),
  };
}

/** The preview: what would be written and what is wrong with the rest. Writes nothing. */
export async function runImportCheck(
  definition: ImportDefinition,
  actor: SessionUser,
  formData: FormData,
): Promise<ImportResult> {
  const submission = await readSubmission(definition, formData);
  if ("kind" in submission) return submission;

  const checked = await checkFile(definition, actor, submission.file);
  return "kind" in checked ? checked : checked.preview(checked.results, false);
}

/**
 * Writes the file: it is read and checked again, and only a file whose every row is ready is
 * written, in one transaction with the audit entries. Data that changed since the preview leaves
 * nothing written and gives a new preview (docs/ТЗ.md, 7.13).
 */
export async function runImportConfirm(
  definition: ImportDefinition,
  actor: SessionUser,
  formData: FormData,
): Promise<ImportResult> {
  const submission = await readSubmission(definition, formData);
  if ("kind" in submission) return submission;

  const checked = await checkFile(definition, actor, submission.file);
  if ("kind" in checked) return checked;

  const ready = checked.results.flatMap((result) => ("ready" in result ? [result.ready] : []));
  // The button is offered only for a file without errors, so errors now mean changed data.
  if (ready.length !== checked.results.length) return checked.preview(checked.results, true);

  const { fileName, options } = submission;
  const request = await getClientInfo();
  const summary = await definition.summary({ fileName, count: ready.length, options });

  try {
    await db.$transaction(async (tx) => {
      await definition.write(tx, ready, { actor, options, fileName, request });
      await logAudit(tx, {
        ...request,
        actor,
        action: "IMPORT",
        entity: definition.entity,
        summary,
      });
    });
  } catch (error) {
    if (!(error instanceof ImportStale)) throw error;
    // Nothing was written; the checks tell the user what changed.
    return checked.preview(await definition.check(checked.rows, actor), true);
  }

  definition.revalidate?.();
  return { kind: "written", count: ready.length };
}
