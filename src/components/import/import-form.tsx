"use client";

import { AlertTriangleIcon, DownloadIcon, FileUpIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { checkImportFile, confirmImportFile } from "@/features/import/actions";
import {
  IMPORT_FILE_EXTENSION,
  IMPORT_FILE_FIELD,
  IMPORT_OPTION_PREFIX,
  MAX_IMPORT_FILE_BYTES,
  type ImportMessage,
  type ImportResult,
} from "@/lib/import";
import { cn } from "@/lib/utils";

// The page of an import (docs/ТЗ.md, 7.13): the file is checked as soon as it is chosen and the
// preview shows what would be written. The file stays here rather than on the server, so the
// confirmation sends it again with the options ticked.

type ImportOption = { name: string; label: string };

type ImportFormProps = {
  /** The import's name, as the actions and the template link know it. */
  name: string;
  options?: ImportOption[];
  /** Keys of the messages that count the records: the button and the toast of a done import. */
  confirmKey: string;
  writtenKey: string;
  /** Where an import that is done leads, e.g. the registry of the records. */
  doneHref: string;
};

type Preview = Extract<ImportResult, { kind: "preview" }>;

export function ImportForm({ name, options, confirmKey, writtenKey, doneHref }: ImportFormProps) {
  const t = useTranslations("import");
  const translate = useTranslations();
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [failure, setFailure] = useState<ImportMessage | null>(null);
  const [stale, setStale] = useState(false);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [isPending, startTransition] = useTransition();

  function show(result: ImportResult) {
    if (result.kind === "failure") {
      setPreview(null);
      setStale(false);
      setFailure({ key: result.error, values: result.errorValues });
      return;
    }
    setFailure(null);
    if (result.kind === "preview") {
      setPreview(result);
      setStale(result.stale);
      setOnlyErrors(result.ready < result.rows.length);
      return;
    }
    toast.success(translate(writtenKey, { count: result.count }));
    router.push(doneHref);
  }

  function formDataOf(chosenFile: File, withOptions: boolean): FormData {
    const formData = new FormData();
    formData.set(IMPORT_FILE_FIELD, chosenFile);
    if (withOptions) {
      for (const option of options ?? []) {
        formData.set(`${IMPORT_OPTION_PREFIX}${option.name}`, String(chosen[option.name] === true));
      }
    }
    return formData;
  }

  function choose(chosenFile: File | null) {
    setFile(chosenFile);
    setPreview(null);
    setStale(false);
    if (!chosenFile) return;

    if (chosenFile.size > MAX_IMPORT_FILE_BYTES) {
      setFailure({
        key: "import.errors.tooLarge",
        values: { size: MAX_IMPORT_FILE_BYTES / (1024 * 1024) },
      });
      return;
    }
    setFailure(null);
    startTransition(async () => show(await checkImportFile(name, formDataOf(chosenFile, false))));
  }

  function confirm() {
    if (!file) return;
    startTransition(async () => show(await confirmImportFile(name, formDataOf(file, true))));
  }

  const rows =
    preview && (onlyErrors ? preview.rows.filter((row) => row.errors.length > 0) : preview.rows);
  const failed = preview ? preview.rows.length - preview.ready : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* The button of the browser's own file field is labelled by the browser, in its own
            language, so the field itself is hidden behind a label that looks like a button. */}
        <input
          id="import-file"
          type="file"
          accept={IMPORT_FILE_EXTENSION}
          disabled={isPending}
          className="sr-only"
          onChange={(event) => {
            const chosenFile = event.target.files?.[0] ?? null;
            // Cleared, so that choosing the corrected file of the same name checks it again.
            event.target.value = "";
            choose(chosenFile);
          }}
        />
        <Label
          htmlFor="import-file"
          className={cn(
            buttonVariants(),
            "cursor-pointer has-disabled:pointer-events-none",
            isPending && "pointer-events-none opacity-50",
          )}
        >
          <FileUpIcon aria-hidden />
          {t("file")}
        </Label>
        <Button variant="outline" asChild>
          <Link href={`/api/import/template?name=${name}`} prefetch={false}>
            <DownloadIcon aria-hidden />
            {t("template")}
          </Link>
        </Button>
      </div>

      {file && <p className="text-sm text-muted-foreground">{t("chosen", { file: file.name })}</p>}

      {failure && <Message>{translate(failure.key, failure.values)}</Message>}
      {stale && <Message>{t("changed")}</Message>}
      {isPending && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" aria-hidden />
          {t("checking")}
        </p>
      )}

      {preview && rows && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm" role="status">
              {t("summary", { rows: preview.rows.length, ready: preview.ready, failed })}
            </p>
            <div className="flex items-center gap-2">
              <Checkbox
                id="only-errors"
                checked={onlyErrors}
                disabled={failed === 0}
                onCheckedChange={(checked) => setOnlyErrors(checked === true)}
              />
              <Label htmlFor="only-errors" className="text-sm font-normal">
                {t("onlyErrors")}
              </Label>
            </div>
          </div>

          <div className="rounded-lg border">
            {/* The columns are as wide as their content needs, and the table scrolls inside its
                block rather than squeezing every column (docs/ТЗ.md, 3.2). */}
            <Table className="w-auto min-w-full">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">{t("rowNumber")}</TableHead>
                  {preview.columns.map((column) => (
                    <TableHead key={column.key}>{column.header}</TableHead>
                  ))}
                  <TableHead>{t("result")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.rowNumber}>
                    <TableCell className="align-top tabular-nums">{row.rowNumber}</TableCell>
                    {preview.columns.map((column) => (
                      <TableCell
                        key={column.key}
                        className={cn(
                          "align-top",
                          column.wrap ? "max-w-88 whitespace-pre-line" : "whitespace-pre",
                        )}
                      >
                        {row.cells[column.key]}
                      </TableCell>
                    ))}
                    <TableCell className="max-w-96 align-top">
                      {row.errors.length === 0 ? (
                        <span className="text-muted-foreground">{t("rowReady")}</span>
                      ) : (
                        <ul className="flex flex-col gap-1 text-destructive">
                          {row.errors.map((error, index) => (
                            <li key={index}>
                              <RowError
                                error={error}
                                headers={preview.headers}
                                translate={translate}
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {(options ?? []).map((option) => (
              <div key={option.name} className="flex items-center gap-2">
                <Checkbox
                  id={`option-${option.name}`}
                  checked={chosen[option.name] === true}
                  disabled={isPending}
                  onCheckedChange={(checked) =>
                    setChosen((current) => ({ ...current, [option.name]: checked === true }))
                  }
                />
                <Label htmlFor={`option-${option.name}`} className="text-sm font-normal">
                  {option.label}
                </Label>
              </div>
            ))}
            <Button
              type="button"
              disabled={isPending || failed > 0 || preview.ready === 0}
              onClick={confirm}
            >
              {translate(confirmKey, { count: preview.ready })}
            </Button>
            {failed > 0 && <p className="text-sm text-muted-foreground">{t("fixAndReload")}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/** A refusal of the file as a whole, or of the confirmation. */
function Message({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/40 px-4 py-3 text-sm text-destructive"
    >
      <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

type RowErrorProps = {
  error: ImportMessage;
  headers: Record<string, string>;
  translate: (key: string, values?: Record<string, string | number>) => string;
};

/** The message of a row, under the heading of the column it belongs to and with its link. */
function RowError({ error, headers, translate }: RowErrorProps) {
  const heading = error.column ? headers[error.column] : undefined;
  const text = translate(error.key, error.values);

  return (
    <>
      {heading && <span className="font-medium">{heading}: </span>}
      {error.href ? (
        <Link href={error.href} className="underline underline-offset-2">
          {text}
        </Link>
      ) : (
        text
      )}
    </>
  );
}
